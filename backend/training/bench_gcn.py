"""Benchmark graph_dkt training speed for different (K, batch_size) pairs.

Reports per-epoch wall time for each config on the 50-user subset.
Usage: python3 -m training.bench_gcn
"""

import logging
import time

import torch
import torch.nn as nn
from torch.optim import Adam
from torch.utils.data import DataLoader

from data.topic_graph import CPTopicGraph
from models.dkt import DKTDataset, collate_fn
from models.graph_dkt import GraphDKTModel
from training.train_dkt import load_csv_sequences, split_sequences, LengthBatchSampler

logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

CONFIGS = [
    ("K=100, B=32 (baseline)", dict(gcn_chunk_size=100), dict(batch=32)),
    ("K=500, B=32 (K-only)  ", dict(gcn_chunk_size=500), dict(batch=32)),
    ("K=100, B=16 (B-only)  ", dict(gcn_chunk_size=100), dict(batch=16)),
    ("K=500, B=16 (combined)", dict(gcn_chunk_size=500), dict(batch=16)),
]

# Use the 50-user subset
CSV = "data/smoke_50.csv"
N_EPOCHS = 2
LR = 0.001


def run_one(label: str, model_kw: dict, loader_kw: dict, topic_graph, seqs: list, device: str) -> float:
    """Run 2 training epochs, return mean epoch time in seconds."""
    train_seqs, val_seqs = split_sequences(seqs)

    train_dataset = DKTDataset(train_seqs, topic_graph)
    train_lengths = [len(s) for s in train_seqs]
    train_sampler = LengthBatchSampler(train_lengths, batch_size=loader_kw["batch"], shuffle=True, seed=42)
    train_loader = DataLoader(train_dataset, batch_sampler=train_sampler, collate_fn=lambda x: x)

    model = GraphDKTModel(num_topics=topic_graph.num_topics, topic_graph=topic_graph, **model_kw)
    model.to(device)
    optimizer = Adam(model.parameters(), lr=LR)
    criterion = nn.BCELoss(reduction="none")

    times = []
    for epoch in range(N_EPOCHS):
        model.train()
        t0 = time.time()
        for batch_seqs in train_loader:
            batch = collate_fn(batch_seqs, topic_graph)
            batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

            predictions, _ = model(batch)
            mask = batch["mask"]
            topic_ids = batch["topic_ids"]
            solved = batch["solved"].squeeze(-1)
            weights = batch["weight"].squeeze(-1)

            pred_for_target = predictions[:, :-1, :].gather(2, topic_ids[:, 1:].unsqueeze(-1)).squeeze(-1)
            target = solved[:, 1:]
            target_weights = weights[:, 1:]
            target_mask = mask[:, 1:]

            loss_raw = criterion(pred_for_target, target)
            loss_masked = (loss_raw * target_weights * target_mask.float()).sum() / \
                          (target_weights * target_mask.float()).sum().clamp(min=1)

            optimizer.zero_grad()
            loss_masked.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()

        t = time.time() - t0
        times.append(t)
        print(f"  Epoch {epoch + 1}: {t:.1f}s")

    return sum(times) / len(times)


def main():
    device = "cpu"
    print(f"\nDevice: {device} | Dataset: 50 users ({CSV}) | Epochs per config: {N_EPOCHS}\n")

    topic_graph = CPTopicGraph()
    sequences = load_csv_sequences(CSV, topic_graph)
    print(f"Loaded {len(sequences)} user sequences\n")

    results = []
    for label, model_kw, loader_kw in CONFIGS:
        print(f"─── {label} ───")
        try:
            mean_time = run_one(label, model_kw, loader_kw, topic_graph, sequences, device)
            results.append((label, mean_time))
            print(f"  Mean: {mean_time:.1f}s\n")
        except Exception as e:
            print(f"  FAILED: {e}\n")
            results.append((label, None))

    print("=" * 55)
    print(f"{'Config':<28} {'Mean epoch (s)':>14} {'vs baseline':>12}")
    print("-" * 55)
    base_time = results[0][1] if results[0][1] else 1.0
    for label, t in results:
        if t is None:
            print(f"{label:<28} {'FAILED':>14} {'—':>12}")
        else:
            ratio = base_time / t if base_time > 0 else 0
            print(f"{label:<28} {t:>14.1f} {ratio:>11.1f}x")
    print("=" * 55)


if __name__ == "__main__":
    main()
