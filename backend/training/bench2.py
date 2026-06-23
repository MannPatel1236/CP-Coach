"""Benchmark graph_dkt training — K-only, batch-only, combined."""

import logging
import random
import time

import torch
import torch.nn as nn
from torch.optim import Adam
from torch.utils.data import DataLoader

from data.topic_graph import CPTopicGraph
from models.dkt import DKTDataset, collate_fn
from models.graph_dkt import GraphDKTModel
from training.train_dkt import load_csv_sequences, LengthBatchSampler

logging.basicConfig(level=logging.WARNING)

CSV = "data/smoke_50.csv"
N_EPOCHS = 2
LR = 0.001
CONFIGS = [
    ("K=100 B=32 (baseline)", dict(gcn_chunk_size=100, batch=32)),
    ("K=500 B=32 (K-only)  ", dict(gcn_chunk_size=500, batch=32)),
    ("K=100 B=16 (B-only)  ", dict(gcn_chunk_size=100, batch=16)),
    ("K=500 B=16 (combined)", dict(gcn_chunk_size=500, batch=16)),
]


def run_one(label, mkw, bs, tg, seqs):
    rng = random.Random(42)
    s = list(seqs)
    rng.shuffle(s)
    train = s[: int(len(s) * 0.8)]
    print(f"\n--- {label} ---", flush=True)
    print(f"  Train users: {len(train)}", flush=True)
    ds = DKTDataset(train, tg)
    sampler = LengthBatchSampler(
        [len(x) for x in train], batch_size=bs, shuffle=True, seed=42
    )
    loader = DataLoader(ds, batch_sampler=sampler, collate_fn=lambda x: x)
    model = GraphDKTModel(
        num_topics=tg.num_topics, topic_graph=tg, **mkw
    ).to("cpu")
    opt = Adam(model.parameters(), lr=LR)
    crit = nn.BCELoss(reduction="none")
    times = []
    for ep in range(N_EPOCHS):
        model.train()
        t0 = time.time()
        for b2 in loader:
            b = collate_fn(b2, tg)
            b = {
                k: v.to("cpu") if isinstance(v, torch.Tensor) else v
                for k, v in b.items()
            }
            p, _ = model(b)
            mask = b["mask"]
            tids = b["topic_ids"]
            s2 = b["solved"].squeeze(-1)
            w = b["weight"].squeeze(-1)
            pt = p[:, :-1, :].gather(
                2, tids[:, 1:].unsqueeze(-1)
            ).squeeze(-1)
            tgt = s2[:, 1:]
            lr2 = crit(pt, tgt)
            lm = (lr2 * w[:, 1:] * mask[:, 1:].float()).sum() / (
                w[:, 1:] * mask[:, 1:].float()
            ).sum().clamp(min=1)
            opt.zero_grad()
            lm.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
        t = time.time() - t0
        times.append(t)
        print(f"  Ep{ep + 1}: {t:.1f}s", flush=True)
    mt = sum(times) / len(times)
    print(f"  Mean: {mt:.1f}s", flush=True)
    return mt


tg = CPTopicGraph()
seqs = load_csv_sequences(CSV, tg)
print(f"Users: {len(seqs)}", flush=True)
results = []
for label, kw in CONFIGS:
    t = run_one(label, kw, kw["batch"], tg, seqs)
    results.append((label, t))
print("\n" + "=" * 55)
print(f"{'Config':<28} {'Mean epoch(s)':>14} {'Speedup':>12}")
print("-" * 55)
base = results[0][1]
for label, t in results:
    print(f"{label:<28} {t:>14.1f} {base / t:>11.1f}x")
print("=" * 55)
