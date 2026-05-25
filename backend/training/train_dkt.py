"""CLI training script for DKT / Graph-DKT."""

import argparse
import logging
import sys
from collections import defaultdict

import pandas as pd
import random
import numpy as np
import torch
import torch.nn as nn
from torch.optim import Adam
from torch.utils.data import DataLoader

from data.topic_graph import CPTopicGraph
from models.dkt import DKTModel, DKTDataset, collate_fn
from models.graph_dkt import GraphDKTModel
from training.evaluate import evaluate_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)


def load_csv_sequences(csv_path: str, topic_graph: CPTopicGraph) -> list[list[dict]]:
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
            "solved": int(row["solved"]),
            "difficulty": float(row["difficulty"]),
            "timestamp_delta": float(row["timestamp_delta"]),
            "weight": 1.0,
        })

    # Filter out very short sequences
    sequences = [seq for seq in user_seqs.values() if len(seq) >= 3]
    return sequences


def split_sequences(sequences, val_ratio=0.2):
    """Split by user (no data leakage)."""
    n = len(sequences)
    split_idx = int(n * (1 - val_ratio))
    return sequences[:split_idx], sequences[split_idx:]


def train_epoch(model, dataloader, optimizer, criterion, topic_graph, device):
    model.train()
    total_loss = 0.0
    total_steps = 0

    for batch_seqs in dataloader:
        batch = collate_fn(batch_seqs, topic_graph)
        batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

        predictions, _ = model(batch)  # (B, T, num_topics)
        mask = batch["mask"]
        topic_ids = batch["topic_ids"]
        solved = batch["solved"].squeeze(-1)

        # Gather predictions at the correct topic index
        B, T, N = predictions.shape
        topic_ids_expanded = topic_ids.unsqueeze(-1)  # (B, T, 1)
        pred_at_topic = predictions.gather(2, topic_ids_expanded).squeeze(-1)  # (B, T)

        # Masked loss
        loss_raw = criterion(pred_at_topic, solved)  # (B, T)
        loss_masked = (loss_raw * mask.float()).sum() / mask.float().sum().clamp(min=1)

        optimizer.zero_grad()
        loss_masked.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        optimizer.step()

        total_loss += loss_masked.item() * mask.float().sum().item()
        total_steps += mask.float().sum().item()

    return total_loss / max(total_steps, 1)


def main():
    parser = argparse.ArgumentParser(description="Train DKT / Graph-DKT model")
    parser.add_argument("--data", required=True, help="Path to training CSV")
    parser.add_argument("--model", choices=["dkt", "graph_dkt"], default="graph_dkt")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--lr", type=float, default=0.001)
    parser.add_argument("--batch", type=int, default=32)
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--out", default="weights/graph_dkt.pt")
    args = parser.parse_args()

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

    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Device: %s", device)

    topic_graph = CPTopicGraph()

    # Load data
    logger.info("Loading data from %s", args.data)
    sequences = load_csv_sequences(args.data, topic_graph)
    logger.info("Loaded %d user sequences", len(sequences))

    if len(sequences) < 5:
        logger.error("Need at least 5 user sequences to train. Got %d.", len(sequences))
        sys.exit(1)

    train_seqs, val_seqs = split_sequences(sequences)
    logger.info("Train: %d | Val: %d", len(train_seqs), len(val_seqs))

    train_dataset = DKTDataset(train_seqs, topic_graph)
    val_dataset = DKTDataset(val_seqs, topic_graph)

    # Custom collate that returns raw sequences (collate_fn called inside train loop)
    train_loader = DataLoader(train_dataset, batch_size=args.batch, shuffle=True, collate_fn=lambda x: x)
    val_loader = DataLoader(val_dataset, batch_size=args.batch, shuffle=False, collate_fn=lambda x: x)

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

    print(f"\n{'Epoch':>5} {'Train Loss':>12} {'Val Loss':>10} {'Val AUC':>10}")
    print("-" * 40)

    for epoch in range(1, args.epochs + 1):
        train_loss = train_epoch(model, train_loader, optimizer, criterion, topic_graph, device)
        val_metrics = evaluate_model(model, val_loader, topic_graph, device)

        print(f"{epoch:>5d} {train_loss:>12.4f} {val_metrics['loss']:>10.4f} {val_metrics['auc']:>10.4f}")

        if val_metrics["auc"] > best_auc:
            best_auc = val_metrics["auc"]
            patience_counter = 0
            # Save best
            if args.model == "graph_dkt":
                GraphDKTModel.save(model, args.out)
            else:
                DKTModel.save(model, args.out)
            logger.info("Saved best model (AUC=%.4f) → %s", best_auc, args.out)
        else:
            patience_counter += 1
            if patience_counter >= patience:
                logger.info("Early stopping at epoch %d (patience=%d)", epoch, patience)
                break

    print(f"\nBest Val AUC: {best_auc:.4f}")
    print(f"Model saved to: {args.out}")


if __name__ == "__main__":
    main()
