"""CLI training script for DKT / Graph-DKT."""

import argparse
import logging
import math
import os
import sys
from collections import defaultdict

import pandas as pd
import random
import numpy as np
import torch
import torch.nn as nn
from torch.optim import Adam
from torch.utils.data import DataLoader, Sampler

from data.topic_graph import CPTopicGraph
from models.dkt import DKTModel, DKTDataset, collate_fn
from models.graph_dkt import GraphDKTModel
from training.evaluate import evaluate_model, get_target_prediction

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)


class LengthBatchSampler(Sampler):
    """Groups sequences of similar length into batches to minimize padding.

    Sequences are sorted by length and grouped into contiguous batches,
    then the batch order is shuffled for training randomness (validation
    uses shuffle=False for deterministic ordering).
    """

    def __init__(self, lengths: list[int], batch_size: int, shuffle: bool = True, seed: int = 42):
        self.lengths = lengths
        self.batch_size = batch_size
        self.shuffle = shuffle
        self.rng = random.Random(seed)

    def __iter__(self):
        n = len(self.lengths)
        # Sort indices by sequence length (group similar-length sequences)
        sorted_indices = sorted(range(n), key=lambda i: self.lengths[i])

        # Group into batches of batch_size
        batches = [sorted_indices[i:i + self.batch_size] for i in range(0, n, self.batch_size)]

        # Shuffle batch order for training randomness
        if self.shuffle:
            self.rng.shuffle(batches)

        return iter(batches)

    def __len__(self) -> int:
        return math.ceil(len(self.lengths) / self.batch_size)


def load_csv_sequences(csv_path: str, topic_graph: CPTopicGraph, max_seq_len: int = 0) -> list[list[dict]]:
    """Load CSV and group rows by user_id into sequences."""
    df = pd.read_csv(csv_path)
    required = {"user_id", "topic", "solved", "difficulty", "timestamp_delta"}
    if not required.issubset(set(df.columns)):
        logger.error("CSV must have columns: %s. Found: %s", required, set(df.columns))
        sys.exit(1)

    user_seqs = defaultdict(list)
    for _, row in df.iterrows():
        topic = str(row["topic"])
        if topic not in topic_graph.topic_to_idx:
            continue
        user_seqs[row["user_id"]].append({
            "topic": topic,
            "solved": int(row["solved"]),  # type: ignore[arg-type]
            "difficulty": float(row["difficulty"]),  # type: ignore[arg-type]
            "timestamp_delta": float(row["timestamp_delta"]),  # type: ignore[arg-type]
            "weight": float(row["weight"]) if "weight" in row.index else 1.0,  # type: ignore[arg-type]
        })

    # Filter out very short sequences and truncate if requested
    sequences = []
    for seq in user_seqs.values():
        if len(seq) < 3:
            continue
        if max_seq_len > 0 and len(seq) > max_seq_len:
            seq = seq[-max_seq_len:]
        sequences.append(seq)
    return sequences


def split_sequences(sequences, val_ratio=0.2):
    """Split by user (no data leakage)."""
    n = len(sequences)
    split_idx = int(n * (1 - val_ratio))
    return sequences[:split_idx], sequences[split_idx:]


def kfold_split(sequences, k: int = 5, seed: int = 42):
    """Split sequences into k folds for cross-validation.

    Each fold returns (train, val). The union of all val sets equals
    the input (every sequence appears in exactly one val set). Folds are
    interleaved from a seeded shuffle so each val set is the same size
    (within ±1 when n % k != 0).

    For k=1, falls through to ``split_sequences`` to preserve the
    deterministic prefix-split behavior used by the single-split CLI path.

    Args:
        sequences: list of per-user sequences.
        k: number of folds. Must be <= len(sequences).
        seed: random seed for reproducibility.

    Returns:
        list of (train_seqs, val_seqs) tuples, length k.
    """
    if k == 1:
        return [split_sequences(sequences)]
    if k > len(sequences):
        raise ValueError(f"k={k} cannot exceed len(sequences)={len(sequences)}")

    rng = random.Random(seed)
    shuffled = list(sequences)  # don't mutate caller's list
    rng.shuffle(shuffled)

    folds = []
    for i in range(k):
        val = shuffled[i::k]                                  # interleaved slice
        train = [s for j, s in enumerate(shuffled) if j % k != i]
        folds.append((train, val))
    return folds


def _fold_output_path(base: str, fold_idx: int | None, total_folds: int) -> str:
    """Derive per-fold output path. For total_folds==1, returns ``base`` unchanged.

    Inserts ``_foldN`` before the file extension, e.g.
    ``weights/dkt.pt`` → ``weights/dkt_fold0.pt`` for fold 0 of 5.
    """
    if total_folds == 1 or fold_idx is None:
        return base
    stem, ext = os.path.splitext(base)
    return f"{stem}_fold{fold_idx}{ext}"


def train_one_fold(args, train_seqs, val_seqs, topic_graph, device, fold_idx=None, total_folds=1):
    """Train one fold; return the best val AUC achieved.

    Args:
        args: parsed CLI args (model, epochs, lr, batch, out, ...).
        train_seqs: per-user sequences for the train split.
        val_seqs: per-user sequences for the val split.
        topic_graph: CPTopicGraph instance.
        device: 'cpu', 'cuda', or 'mps'.
        fold_idx: 0-indexed fold number (None for single-split mode).
        total_folds: total number of folds (1 for single-split mode).

    Returns:
        Best val AUC seen during training.
    """
    out_path = _fold_output_path(args.out, fold_idx, total_folds)
    if fold_idx is not None:
        logger.info("=== Fold %d/%d (saving to %s) ===", fold_idx + 1, total_folds, out_path)

    train_dataset = DKTDataset(train_seqs, topic_graph)
    val_dataset = DKTDataset(val_seqs, topic_graph)

    # Use LengthBatchSampler so sequences of similar length are batched
    # together, minimizing wasted padding tokens in the LSTM.
    train_lengths = [len(s) for s in train_seqs]
    val_lengths = [len(s) for s in val_seqs]
    train_sampler = LengthBatchSampler(train_lengths, batch_size=args.batch, shuffle=True, seed=args.seed)
    val_sampler = LengthBatchSampler(val_lengths, batch_size=args.batch, shuffle=False, seed=args.seed)

    train_loader = DataLoader(train_dataset, batch_sampler=train_sampler, collate_fn=lambda x: x)
    val_loader = DataLoader(val_dataset, batch_sampler=val_sampler, collate_fn=lambda x: x)

    # Model
    if args.model == "graph_dkt":
        model = GraphDKTModel(num_topics=topic_graph.num_topics, topic_graph=topic_graph)
    else:
        model = DKTModel(num_topics=topic_graph.num_topics)
    model.to(device)
    logger.info("Model: %s | Params: %d", args.model, sum(p.numel() for p in model.parameters()))

    optimizer = Adam(model.parameters(), lr=args.lr)
    criterion = nn.BCELoss(reduction="none")

    # Training loop
    best_auc = 0.0
    patience_counter = 0
    patience = 5
    import time as _time

    print(f"\n{'Epoch':>5} {'Train Loss':>12} {'Val Loss':>10} {'Val AUC':>10} {'Time':>8}", flush=True)
    print("-" * 48, flush=True)

    for epoch in range(1, args.epochs + 1):
        t0 = _time.time()
        train_loss = train_epoch(model, train_loader, optimizer, criterion, topic_graph, device)
        val_metrics = evaluate_model(model, val_loader, topic_graph, device)
        elapsed = _time.time() - t0

        print(f"{epoch:>5d} {train_loss:>12.4f} {val_metrics['loss']:>10.4f} {val_metrics['auc']:>10.4f} {elapsed:>7.0f}s", flush=True)

        # Tolerance: ignore AUC improvements smaller than 1e-4 (display precision).
        # Without this, patience never increments once val AUC plateaus near 1.0,
        # because the LSTM keeps producing microscopic improvements
        # (1.00000001 > 1.00000000) and the model trains all 50 epochs.
        if val_metrics["auc"] - best_auc > 1e-4:
            best_auc = val_metrics["auc"]
            patience_counter = 0
            # Save best
            if args.model == "graph_dkt":
                GraphDKTModel.save(model, out_path)
            else:
                DKTModel.save(model, out_path)
            logger.info("Saved best model (AUC=%.4f) → %s", best_auc, out_path)
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logger.info("Early stopping at epoch %d (patience=%d)", epoch, patience)
                break

    return best_auc


def train_epoch(model, dataloader, optimizer, criterion, topic_graph, device):
    model.train()
    total_loss = 0.0
    total_steps = 0

    for batch_seqs in dataloader:
        batch = collate_fn(batch_seqs, topic_graph)
        batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

        predictions, _ = model(batch)  # (B, T, num_topics)
        mask = batch["mask"]  # (B, T)
        topic_ids = batch["topic_ids"]  # (B, T)
        solved = batch["solved"].squeeze(-1)  # (B, T)
        weights = batch["weight"].squeeze(-1)  # (B, T)

        # Standard DKT alignment (Piech et al. 2015): after input at t, the
        # model predicts the outcome at t+1.  The target topic is c_{t+1}
        # (the one that actually appears next), NOT c_t (the one just
        # observed).  The shared helper enforces the exact same pairing as
        # evaluate.py so training and evaluation can never drift apart.
        pred_for_target = get_target_prediction(predictions, topic_ids)  # (B, T-1)
        target = solved[:, 1:]  # (B, T-1)
        target_weights = weights[:, 1:]  # (B, T-1)
        target_mask = mask[:, 1:]  # (B, T-1)

        loss_raw = criterion(pred_for_target, target)
        loss_masked = (loss_raw * target_weights * target_mask.float()).sum() / (target_weights * target_mask.float()).sum().clamp(min=1)

        optimizer.zero_grad()
        loss_masked.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        total_loss += loss_masked.item() * target_mask.float().sum().item()
        total_steps += target_mask.float().sum().item()

    return total_loss / max(total_steps, 1)


def main():
    parser = argparse.ArgumentParser(description="Train DKT / Graph-DKT model")
    parser.add_argument("--data", required=True, help="Path to training CSV")
    parser.add_argument("--model", choices=["dkt", "graph_dkt"], default="graph_dkt")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--max-seq-len", type=int, default=0, help="Truncate sequences to this length (0=no truncation)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--folds", type=int, default=1, help="K-fold CV (default 1 = single split, no shuffle)")
    parser.add_argument("--start-fold", type=int, default=0, help="First fold to train (0-indexed, inclusive). Use to resume a partial CV.")
    parser.add_argument("--end-fold", type=int, default=None, help="Last fold to train (0-indexed, inclusive). Default: --folds-1.")
    parser.add_argument("--out", default="weights/graph_dkt.pt")
    parser.add_argument("--device", default=None, help='Override device detection: "cpu", "mps", or "cuda"')
    args = parser.parse_args()

    if args.folds < 1:
        logger.error("--folds must be >= 1 (got %d).", args.folds)
        sys.exit(1)
    if args.start_fold < 0 or args.start_fold >= args.folds:
        logger.error("--start-fold must be in [0, %d) (got %d).", args.folds, args.start_fold)
        sys.exit(1)
    end_fold = args.end_fold if args.end_fold is not None else args.folds - 1
    if end_fold < args.start_fold or end_fold >= args.folds:
        logger.error("--end-fold must be in [%d, %d) (got %d).", args.start_fold, args.folds, end_fold)
        sys.exit(1)

    # Set random seeds for reproducibility
    seed = args.seed
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    logger.info("Random seed set to: %d", seed)

    if args.device is not None:
        device = args.device
        logger.info("Device: %s (from --device flag)", device)
    elif torch.cuda.is_available():
        device = "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    logger.info("Device: %s", device)

    topic_graph = CPTopicGraph()

    # Load data
    logger.info("Loading data from %s", args.data)
    sequences = load_csv_sequences(args.data, topic_graph, max_seq_len=args.max_seq_len)
    logger.info("Loaded %d user sequences", len(sequences))

    if len(sequences) < 5:
        logger.error("Need at least 5 user sequences to train. Got %d.", len(sequences))
        sys.exit(1)

    if args.folds == 1:
        # Single split (backward-compat path — same behavior as before CV was added)
        train_seqs, val_seqs = split_sequences(sequences)
        logger.info("Train: %d | Val: %d", len(train_seqs), len(val_seqs))
        best_auc = train_one_fold(args, train_seqs, val_seqs, topic_graph, device)
        print(f"\nBest Val AUC: {best_auc:.4f}")
        print(f"Model saved to: {args.out}")
    else:
        # K-fold CV
        logger.info("Running %d-fold CV (seed=%d), folds [%d, %d]", args.folds, seed, args.start_fold, end_fold)
        fold_pairs = kfold_split(sequences, k=args.folds, seed=seed)
        fold_aucs = []
        for i, (train_seqs, val_seqs) in enumerate(fold_pairs):
            if i < args.start_fold or i > end_fold:
                logger.info("Fold %d/%d: skipped (outside [%d, %d])", i + 1, args.folds, args.start_fold, end_fold)
                continue
            auc = train_one_fold(
                args, train_seqs, val_seqs, topic_graph, device,
                fold_idx=i, total_folds=args.folds,
            )
            fold_aucs.append(auc)
            logger.info("Fold %d/%d best AUC: %.4f", i + 1, args.folds, auc)
        if fold_aucs:
            arr = np.array(fold_aucs)
            print(f"\nCV summary ({len(fold_aucs)} folds): {arr.mean():.4f} ± {arr.std(ddof=0):.4f} (mean ± std)")


if __name__ == "__main__":
    main()
