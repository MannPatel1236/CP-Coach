#!/usr/bin/env python3
"""Efficiency benchmark: time per training step + peak memory per model.

Models: DKT, Graph-DKT (directed), SAKT-style (sdpa AND naive backends),
DKVMN-style. Conditions: L in {2000, 10000} x batch in {1, TRAIN_BS}.
Measures on the SAME GPU in one process. OOMs are caught and recorded as
OOM (no assertion about scaling is made; report what is measured).

Each number records which attention implementation was used (sakt-sdpa /
sakt-naive).  Writes a plain-text table to
backend/results/efficiency_benchmark.txt by default.

Requires CUDA; exits(2) without CUDA (never fakes numbers).
"""

import argparse
import os
import sys
import time

import torch
import torch.nn as nn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.topic_graph import CPTopicGraph  # noqa: E402
from models.dkt import DKTModel  # noqa: E402
from models.dkvmn import DKVMNStyleModel  # noqa: E402
from models.graph_dkt import GraphDKTModel  # noqa: E402
from models.sakt import SAKTStyleModel  # noqa: E402
from training.evaluate import get_target_prediction  # noqa: E402

TRAIN_BS = 16  # training batch size used on Kaggle for the 2k runs
WARMUP, TIMED = 3, 5


def make_batch(B, L, num_topics, device):
    return {
        "topic_ids": torch.randint(0, num_topics, (B, L), device=device),
        "solved": torch.randint(0, 2, (B, L, 1), device=device).float(),
        "difficulty": torch.rand(B, L, 1, device=device),
        "ts_delta": torch.rand(B, L, 1, device=device) * 7.0,
        "mask": torch.ones(B, L, dtype=torch.bool, device=device),
    }


def bench_step(model, batch, topic_graph):
    """One training step (forward + DKT-aligned loss + backward + Adam step)."""
    opt = torch.optim.Adam(model.parameters(), lr=0.001)
    crit = nn.BCELoss()
    opt.zero_grad()
    preds, _ = model(batch)
    loss = crit(get_target_prediction(preds, batch["topic_ids"]),
                batch["solved"][:, 1:, 0])
    loss.backward()
    opt.step()
    return loss.item()


def measure(model, batch, topic_graph, device):
    """Returns (mean_step_seconds, peak_bytes) or ('OOM', 'OOM')."""
    try:
        for _ in range(WARMUP):
            bench_step(model, batch, topic_graph)
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
        t0 = time.perf_counter()
        for _ in range(TIMED):
            bench_step(model, batch, topic_graph)
        torch.cuda.synchronize()
        dt = (time.perf_counter() - t0) / TIMED
        peak = torch.cuda.max_memory_allocated()
        return dt, peak
    except torch.OutOfMemoryError:
        torch.cuda.empty_cache()
        return None, None


def build_model(name, num_topics, topic_graph):
    if name == "dkt":
        return DKTModel(num_topics=num_topics)
    if name == "graph_dkt":
        return GraphDKTModel(num_topics=num_topics, topic_graph=topic_graph)
    if name == "sakt-sdpa":
        return SAKTStyleModel(num_topics=num_topics, attn="sdpa")
    if name == "sakt-naive":
        return SAKTStyleModel(num_topics=num_topics, attn="naive")
    if name == "dkvmn":
        return DKVMNStyleModel(num_topics=num_topics)
    raise ValueError(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=None,
                    help="Output txt path (default: <backend>/results/efficiency_benchmark.txt)")
    ap.add_argument("--train-bs", type=int, default=TRAIN_BS)
    args = ap.parse_args()

    if not torch.cuda.is_available():
        print("benchmark_efficiency: no CUDA device — refusing to fake numbers. Run on Kaggle GPU.")
        sys.exit(2)

    device = "cuda"
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_path = args.out or os.path.join(root, "results", "efficiency_benchmark.txt")
    topic_graph = CPTopicGraph()
    N = topic_graph.num_topics

    names = ["dkt", "graph_dkt", "sakt-sdpa", "sakt-naive", "dkvmn"]
    conds = [(2000, 1), (2000, args.train_bs), (10000, 1), (10000, args.train_bs)]
    rows = {}  # (name, L, B) -> (dt, peak) or None
    for name in names:
        for (L, B) in conds:
            torch.cuda.empty_cache()
            try:
                model = build_model(name, N, topic_graph).to(device)
            except torch.OutOfMemoryError:
                torch.cuda.empty_cache()
                rows[(name, L, B)] = None
                continue
            n_params = sum(p.numel() for p in model.parameters())
            batch = make_batch(B, L, N, device)
            dt, peak = measure(model, batch, topic_graph, device)
            rows[(name, L, B)] = (dt, peak, n_params)
            del model, batch
            torch.cuda.empty_cache()

    param_line = {n: rows[(n, 2000, 1)][2] if rows[(n, 2000, 1)] else "OOM"
                  for n in names}
    with open(out_path, "w") as f:
        f.write("EFFICIENCY BENCHMARK (same GPU, one process; "
                "time = forward+loss+backward+Adam step)\n")
        f.write(f"device: {torch.cuda.get_device_name(0)}\n")
        f.write(f"params: {param_line}\n")
        f.write(f"{'model':<12} {'L':>6} {'B':>4} {'s/step':>10} {'peak_GB':>10}\n")
        for name in names:
            for (L, B) in conds:
                r = rows[(name, L, B)]
                if r is None or r[0] is None:
                    f.write(f"{name:<12} {L:>6d} {B:>4d} {'OOM':>10} {'OOM':>10}\n")
                else:
                    dt, peak, _ = r
                    f.write(f"{name:<12} {L:>6d} {B:>4d} {dt:>10.3f} {peak / 1e9:>10.2f}\n")
    print(f"wrote {out_path}")
    print(open(out_path).read())


if __name__ == "__main__":
    main()
