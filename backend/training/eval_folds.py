#!/usr/bin/env python3
"""Evaluate per-topic AUC on existing fold 0-3 weights (DKT vs Graph-DKT).

Reproduces the same k-fold splits used during training (k=5, seed=42)
so each fold's model is evaluated on its own held-out validation set.
"""

import argparse
import logging
import os
import sys
from collections import defaultdict

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader

# Add backend/ to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from data.topic_graph import CPTopicGraph
from models.dkt import DKTModel, DKTDataset
from models.graph_dkt import GraphDKTModel
from training.evaluate import compute_rule_baseline_pk, evaluate_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "training.csv")
WEIGHTS_DIR = os.path.join(ROOT, "weights")


def load_csv_sequences(csv_path, topic_graph, max_seq_len=0):
    df = pd.read_csv(csv_path)
    required = {"user_id", "topic", "solved", "difficulty", "timestamp_delta"}
    if not required.issubset(set(df.columns)):
        logger.error("CSV must have columns: %s", required)
        sys.exit(1)

    def _to_scalar(val: object) -> int | float:
        """Extract a scalar from a pandas cell (suppresses pyright warnings)."""
        if isinstance(val, int | float):
            return val
        if hasattr(val, "item"):
            return val.item()  # type: ignore[union-attr]
        return int(float(str(val)))  # type: ignore[return-value]

    user_seqs = defaultdict(list)
    for _, row in df.iterrows():
        topic = str(row["topic"])
        if topic not in topic_graph.topic_to_idx:
            continue
        user_seqs[row["user_id"]].append({
            "topic": topic,
            "solved": int(_to_scalar(row["solved"])),
            "difficulty": float(_to_scalar(row["difficulty"])),
            "timestamp_delta": float(_to_scalar(row["timestamp_delta"])),
            "weight": float(_to_scalar(row["weight"])) if "weight" in row.index else 1.0,
        })

    sequences = []
    for seq in user_seqs.values():
        if len(seq) < 3:
            continue
        if max_seq_len > 0 and len(seq) > max_seq_len:
            seq = seq[-max_seq_len:]
        sequences.append(seq)
    return sequences


def kfold_split(sequences, k=5, seed=42):
    import random
    rng = random.Random(seed)
    shuffled = list(sequences)
    rng.shuffle(shuffled)
    folds = []
    for i in range(k):
        val = shuffled[i::k]
        train = [s for j, s in enumerate(shuffled) if j % k != i]
        folds.append((train, val))
    return folds


def segment_by_length(sequences, low_boundary, mid_boundary):
    """Split sequences into low/mid/high activity groups by sequence length.

    Args:
        sequences: list of per-user sequences.
        low_boundary: max length for the low-activity group (inclusive).
        mid_boundary: max length for the mid-activity group (inclusive).

    Returns:
        Tuple of (low_sequences, mid_sequences, high_sequences).
    """
    low, mid, high = [], [], []
    for seq in sequences:
        L = len(seq)
        if L <= low_boundary:
            low.append(seq)
        elif L <= mid_boundary:
            mid.append(seq)
        else:
            high.append(seq)
    return low, mid, high


def main():
    # Parse CLI args
    cli_args = argparse.Namespace(segment_by_length=False, no_rule_baseline=False, device=None, max_seq_len=0)
    _ap = argparse.ArgumentParser()
    _ap.add_argument("--segment-by-length", action="store_true",
                     help="Report per-activity-group AUC (low/mid/high, defined by tertile boundaries of sequence length)")
    _ap.add_argument("--no-rule-baseline", action="store_true",
                     help="Skip rule-based P@K baseline comparison")
    _ap.add_argument("--device", default=None, help='Override device detection: "cpu", "mps", or "cuda"')
    _ap.add_argument("--max-seq-len", type=int, default=0,
                     help="Truncate sequences to this length (0=no truncation, default 0)")
    try:
        cli_args = _ap.parse_args()
    except SystemExit:
        pass  # Allow import without args (used as import)

    if cli_args.device is not None:
        device = cli_args.device
    else:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("Device: %s", device)

    topic_graph = CPTopicGraph()

    # Load data
    logger.info("Loading data from %s", DATA)
    sequences = load_csv_sequences(DATA, topic_graph, max_seq_len=cli_args.max_seq_len)
    logger.info("Loaded %d user sequences", len(sequences))

    # Compute tertile boundaries for activity-level segmentation
    low_boundary = int(np.percentile([len(s) for s in sequences], 33))
    mid_boundary = int(np.percentile([len(s) for s in sequences], 67))
    logger.info("Activity tertiles: low ≤ %d | mid %d-%d | high > %d",
                low_boundary, low_boundary + 1, mid_boundary, mid_boundary)

    # Per-activity-group result tracking (tertile-based)
    segment_results = {
        "low": {"dkt_aucs": [], "gdkt_aucs": [], "n": 0},
        "mid": {"dkt_aucs": [], "gdkt_aucs": [], "n": 0},
        "high": {"dkt_aucs": [], "gdkt_aucs": [], "n": 0},
    }

    # Reproduce 5-fold splits (seed=42, matching train_dkt.py defaults)
    folds = kfold_split(sequences, k=5, seed=42)

    # Fold indices to evaluate (default: all 5)
    fold_indices = [0, 1, 2, 3, 4]

    all_results = []

    for fi in fold_indices:
        _, val_seqs = folds[fi]
        logger.info("=== Fold %d/%d (val: %d users) ===", fi + 1, 5, len(val_seqs))

        val_dataset = DKTDataset(val_seqs, topic_graph)
        val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False, collate_fn=lambda x: x)

        dkt_path = os.path.join(WEIGHTS_DIR, f"dkt_fold{fi}.pt")
        gdkt_path = os.path.join(WEIGHTS_DIR, f"graph_dkt_fold{fi}.pt")

        results: dict[str, object] = {"fold": fi, "val_users": len(val_seqs)}
        dkt_loaded = False

        # --- DKT evaluation ---
        if os.path.exists(dkt_path):
            dkt_model = DKTModel.load(dkt_path)
            if dkt_model is None:
                logger.warning("  DKT load returned None for %s", dkt_path)
                continue
            dkt_model.to(device)
            dkt_metrics = evaluate_model(dkt_model, val_loader, topic_graph, device)
            results["dkt_auc"] = dkt_metrics["auc"]
            dkt_loaded = True
            results["dkt_accuracy"] = dkt_metrics["accuracy"]
            results["dkt_per_topic_auc"] = dkt_metrics["per_topic_auc"]
            results["dkt_precision_at_k"] = dkt_metrics["precision_at_k"]
            results["dkt_ndcg_at_k"] = dkt_metrics["ndcg_at_k"]
            logger.info("  DKT: AUC=%.4f, Acc=%.4f", dkt_metrics["auc"], dkt_metrics["accuracy"])
        else:
            logger.warning("  DKT weights not found: %s", dkt_path)

        # --- Graph-DKT evaluation ---
        if os.path.exists(gdkt_path):
            gdkt_model = GraphDKTModel.load(gdkt_path, topic_graph=topic_graph)
            if gdkt_model is None:
                logger.warning("  Graph-DKT load returned None for %s", gdkt_path)
                continue
            gdkt_model.to(device)
            gdkt_metrics = evaluate_model(gdkt_model, val_loader, topic_graph, device)
            results["gdkt_auc"] = gdkt_metrics["auc"]
            results["gdkt_accuracy"] = gdkt_metrics["accuracy"]
            results["gdkt_per_topic_auc"] = gdkt_metrics["per_topic_auc"]
            results["gdkt_precision_at_k"] = gdkt_metrics["precision_at_k"]
            results["gdkt_ndcg_at_k"] = gdkt_metrics["ndcg_at_k"]
            logger.info("  Graph-DKT: AUC=%.4f, Acc=%.4f", gdkt_metrics["auc"], gdkt_metrics["accuracy"])

            # --- Segment-by-length: evaluate each activity group ---
            if cli_args.segment_by_length and dkt_loaded:
                low, mid, high = segment_by_length(val_seqs, low_boundary, mid_boundary)
                for seg_key, seg_seqs in [("low", low), ("mid", mid), ("high", high)]:
                    if len(seg_seqs) < 2:
                        continue
                    seg_dataset = DKTDataset(seg_seqs, topic_graph)
                    seg_loader = DataLoader(seg_dataset, batch_size=32, shuffle=False, collate_fn=lambda x: x)
                    dkt_seg = evaluate_model(dkt_model, seg_loader, topic_graph, device)
                    gdkt_seg = evaluate_model(gdkt_model, seg_loader, topic_graph, device)
                    segment_results[seg_key]["dkt_aucs"].append(dkt_seg["auc"])
                    segment_results[seg_key]["gdkt_aucs"].append(gdkt_seg["auc"])
                    segment_results[seg_key]["n"] += len(seg_seqs)
                    logger.info("  Segment %s (n=%d): DKT AUC=%.4f, GDKT AUC=%.4f",
                                seg_key, len(seg_seqs), dkt_seg["auc"], gdkt_seg["auc"])

            # --- Rule baseline P@K ---
            if not cli_args.no_rule_baseline:
                rule_metrics = compute_rule_baseline_pk(val_seqs, topic_graph)
                results["rule_precision_at_k"] = rule_metrics["precision_at_k"]
                results["rule_ndcg_at_k"] = rule_metrics["ndcg_at_k"]
        else:
            logger.warning("  Graph-DKT weights not found: %s", gdkt_path)

        all_results.append(results)

        # Free GPU memory before next fold to prevent VRAM accumulation OOM
        if 'dkt_model' in locals():
            del dkt_model
        if 'gdkt_model' in locals():
            del gdkt_model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    # ---- Print aggregate comparison ----
    print("\n" + "=" * 70)
    print(f"AGGREGATE COMPARISON — Folds {fold_indices}")
    print("=" * 70)
    print(f"{'Fold':>5} {'DKT AUC':>10} {'GDKT AUC':>10} {'Delta':>10}")
    print("-" * 70)
    dkt_aucs = []
    gdkt_aucs = []
    for r in all_results:
        d = r.get("dkt_auc", 0)
        g = r.get("gdkt_auc", 0)
        dkt_aucs.append(d)
        gdkt_aucs.append(g)
        print(f"{r['fold']:>5d} {d:>10.4f} {g:>10.4f} {g - d:>+10.4f}")
    if dkt_aucs and gdkt_aucs:
        print("-" * 70)
        d_mean, d_std = np.mean(dkt_aucs), np.std(dkt_aucs, ddof=1)
        g_mean, g_std = np.mean(gdkt_aucs), np.std(gdkt_aucs, ddof=1)
        print(f"{'Mean ± Std':>5} {d_mean:>10.4f}±{d_std:.4f} {g_mean:>10.4f}±{g_std:.4f} {g_mean - d_mean:>+10.4f}")
    print("=" * 70)

    # ---- Segment-by-length aggregate ----
    if cli_args.segment_by_length:
        print("\n" + "=" * 75)
        print("ACTIVITY-LEVEL AGGREGATE (tertile split, averaged across folds)")
        print("=" * 75)
        print(f"{'Group':<24} {'N':>6} {'DKT AUC':>12} {'GDKT AUC':>12} {'Δ':>10}")
        print("-" * 75)
        for seg_key, seg_label in [
            ("low", f"Low (≤{low_boundary})"),
            ("mid", f"Mid ({low_boundary+1}-{mid_boundary})"),
            ("high", f"High (>{mid_boundary})"),
        ]:
            sr = segment_results[seg_key]
            d_aucs = sr["dkt_aucs"]
            g_aucs = sr["gdkt_aucs"]
            n_users = sr["n"]
            if not d_aucs:
                continue
            d_mean = np.mean(d_aucs)
            g_mean = np.mean(g_aucs)
            d_std = np.std(d_aucs, ddof=1) if len(d_aucs) > 1 else 0.0
            g_std = np.std(g_aucs, ddof=1) if len(g_aucs) > 1 else 0.0
            print(f"{seg_label:<18} {n_users:>6d} {d_mean:>8.4f}±{d_std:.4f} {g_mean:>8.4f}±{g_std:.4f} {g_mean - d_mean:>+10.4f}")
        print("=" * 75)

    # ---- Ranking metrics across folds ----
    has_rule_agg = not cli_args.no_rule_baseline
    rule_p_at_k = {k: [] for k in [1, 3, 5, 10]}
    rule_n_at_k = {k: [] for k in [1, 3, 5, 10]}
    for r in all_results:
        rpk = r.get("rule_precision_at_k", {})
        rnk = r.get("rule_ndcg_at_k", {})
        for k in [1, 3, 5, 10]:
            rule_p_at_k[k].append(rpk.get(k, 0))
            rule_n_at_k[k].append(rnk.get(k, 0))

    if has_rule_agg:
        sep_w = 130
        header = f"{'Metric':<10}"
        for k in sorted([1, 3, 5, 10]):
            header += f"  DKT@K={k:<6}  GDKT@K={k:<6}  Rule@K={k:<6}  Δ@K={k:<6}"
    else:
        sep_w = 90
        header = f"{'Metric':<10}"
        for k in sorted([1, 3, 5, 10]):
            header += f"  DKT@K={k:<6}  GDKT@K={k:<6}  Δ@K={k:<6}"
    print("\n" + "=" * sep_w)
    print("RANKING METRICS (averaged across folds)")
    print("=" * sep_w)
    print(header)
    print("-" * sep_w)

    # Aggregate ranking metrics
    dkt_p_at_k = {k: [] for k in [1, 3, 5, 10]}
    gdkt_p_at_k = {k: [] for k in [1, 3, 5, 10]}
    dkt_n_at_k = {k: [] for k in [1, 3, 5, 10]}
    gdkt_n_at_k = {k: [] for k in [1, 3, 5, 10]}
    for r in all_results:
        dpk = r.get("dkt_precision_at_k", {})
        gpk = r.get("gdkt_precision_at_k", {})
        dnk = r.get("dkt_ndcg_at_k", {})
        gnk = r.get("gdkt_ndcg_at_k", {})
        for k in [1, 3, 5, 10]:
            dkt_p_at_k[k].append(dpk.get(k, 0))
            gdkt_p_at_k[k].append(gpk.get(k, 0))
            dkt_n_at_k[k].append(dnk.get(k, 0))
            gdkt_n_at_k[k].append(gnk.get(k, 0))

    for name, dkt_dict, gdkt_dict, rule_dict in [
        ("P@K", dkt_p_at_k, gdkt_p_at_k, rule_p_at_k),
        ("N@K", dkt_n_at_k, gdkt_n_at_k, rule_n_at_k),
    ]:
        line = f"{name:<10}"
        for k in sorted([1, 3, 5, 10]):
            d_mean = np.mean(dkt_dict[k]) if dkt_dict[k] else 0
            g_mean = np.mean(gdkt_dict[k]) if gdkt_dict[k] else 0
            if has_rule_agg:
                r_mean = np.mean(rule_dict[k]) if rule_dict[k] else 0
                line += f"  {d_mean:>10.4f}  {g_mean:>10.4f}  {r_mean:>10.4f}  {g_mean - d_mean:>+10.4f}"
            else:
                line += f"  {d_mean:>10.4f}  {g_mean:>10.4f}  {g_mean - d_mean:>+10.4f}"
        print(line)
    print("=" * sep_w)

    # ---- Per-topic AUC across folds ----
    print("\n" + "=" * 90)
    print("PER-TOPIC AUC (averaged across folds)")
    print("=" * 90)
    print(f"{'Topic':<25} {'DKT':>10} {'GDKT':>10} {'Delta':>10} {'Depth':>6}")
    print("-" * 90)

    # Aggregate per-topic AUC
    all_topics = sorted(topic_graph.TOPICS)
    dkt_topic_aucs = defaultdict(list)
    gdkt_topic_aucs = defaultdict(list)

    for r in all_results:
        for topic in all_topics:
            if topic in r.get("dkt_per_topic_auc", {}):
                dkt_topic_aucs[topic].append(r["dkt_per_topic_auc"][topic])
            if topic in r.get("gdkt_per_topic_auc", {}):
                gdkt_topic_aucs[topic].append(r["gdkt_per_topic_auc"][topic])

    for topic in all_topics:
        d_vals = dkt_topic_aucs.get(topic, [])
        g_vals = gdkt_topic_aucs.get(topic, [])
        d_mean = np.mean(d_vals) if d_vals else 0.0
        g_mean = np.mean(g_vals) if g_vals else 0.0
        delta = g_mean - d_mean

        # Compute depth: longest path from root
        depth = 0
        stack: list[tuple[str, int]] = [(topic, 0)]
        while stack:
            t, d = stack.pop()
            if d > depth:
                depth = d
            for src, tgt in topic_graph.EDGES:
                if tgt == t:
                    stack.append((src, d + 1))
        print(f"{topic:<25} {d_mean:>10.4f} {g_mean:>10.4f} {delta:>+10.4f} {depth:>6d}")

    print("=" * 90)

    # Deep vs shallow: prerequisite-rich topics (depth >= 4) vs shallow (depth <= 2)
    deep_topics = []
    shallow_topics = []
    for topic in all_topics:
        depth = 0
        stack: list[tuple[str, int]] = [(topic, 0)]
        while stack:
            t, d = stack.pop()
            if d > depth:
                depth = d
            for src, tgt in topic_graph.EDGES:
                if tgt == t:
                    stack.append((src, d + 1))
        if depth >= 4:
            deep_topics.append(topic)
        elif depth <= 2:
            shallow_topics.append(topic)

    print("\n" + "=" * 70)
    print("DEEP TOPICS (depth >= 4) — where the graph should help most")
    print("=" * 70)
    for t in sorted(deep_topics):
        d_vals = dkt_topic_aucs.get(t, [])
        g_vals = gdkt_topic_aucs.get(t, [])
        d = np.mean(d_vals) if d_vals else 0
        g = np.mean(g_vals) if g_vals else 0
        print(f"  {t:<25} DKT={d:.4f}  GDKT={g:.4f}  Δ={g-d:+.4f}")

    print("\n" + "=" * 70)
    print("SHALLOW TOPICS (depth <= 2) — baseline comparison")
    print("=" * 70)
    for t in sorted(shallow_topics):
        d_vals = dkt_topic_aucs.get(t, [])
        g_vals = gdkt_topic_aucs.get(t, [])
        d = np.mean(d_vals) if d_vals else 0
        g = np.mean(g_vals) if g_vals else 0
        print(f"  {t:<25} DKT={d:.4f}  GDKT={g:.4f}  Δ={g-d:+.4f}")


if __name__ == "__main__":
    main()
