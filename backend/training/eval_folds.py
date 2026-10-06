#!/usr/bin/env python3
"""Evaluate per-topic AUC on existing fold 0-3 weights (DKT vs Graph-DKT).

Reproduces the same k-fold splits used during training (k=5, seed=42)
so each fold's model is evaluated on its own held-out validation set.
"""

import argparse
import json
import logging
import math
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
from models.graph_dkt import AblationGraphDKTModel, GraphDKTModel
from training.evaluate import RANKING_K_VALUES, compute_rule_baseline_pk, evaluate_model

try:
    from scipy.stats import ttest_rel as _scipy_ttest_rel
except ImportError:  # hand-rolled fallback below
    _scipy_ttest_rel = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger(__name__)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "training.csv")
WEIGHTS_DIR = os.path.join(ROOT, "weights")


def _t_sf(t, df):
    """Two-sided survival function for Student's t (hand-rolled, no scipy).

    Uses the regularized incomplete beta relation with a continued-fraction
    evaluator (Numerical Recipes betacf).  Only used when scipy is missing.
    """
    if t == 0:
        return 1.0
    x = df / (df + t * t)
    ib = _reg_incomplete_beta(df / 2.0, 0.5, x)
    return ib  # == P(|T| > |t|) for the two-sided test


def _reg_incomplete_beta(a, b, x):
    """Regularized incomplete beta I_x(a, b) via continued fraction."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    # Use symmetry to ensure convergence of the continued fraction.
    if x > (a + 1.0) / (a + b + 2.0):
        return 1.0 - _reg_incomplete_beta_cf(b, a, 1.0 - x, True)
    return _reg_incomplete_beta_cf(a, b, x, False)


def _reg_incomplete_beta_cf(a, b, x, complement):
    MAXIT, EPS, FPMIN = 200, 3e-12, 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < FPMIN:
        d = FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, MAXIT + 1):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        h *= d * c
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < FPMIN:
            d = FPMIN
        c = 1.0 + aa / c
        if abs(c) < FPMIN:
            c = FPMIN
        d = 1.0 / d
        delta = c * d
        h *= delta
        if abs(delta - 1.0) < EPS:
            break
    front = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                     + a * math.log(x) + b * math.log(1.0 - x)) / a * h
    return 1.0 - front if complement else front


def paired_ttest(a, b):
    """Paired t-test on two length-n sequences. Returns (t_stat, p_two_sided).

    Uses scipy.stats.ttest_rel when available, else the hand-rolled t SF.
    """
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    if _scipy_ttest_rel is not None:
        res = _scipy_ttest_rel(a, b)
        return float(res.statistic), float(res.pvalue)
    d = a - b
    n = len(d)
    mean = float(np.mean(d))
    sd = float(np.std(d, ddof=1))
    if sd == 0:
        return (0.0 if mean == 0 else math.inf, 1.0 if mean == 0 else 0.0)
    t = mean / (sd / math.sqrt(n))
    return t, _t_sf(t, n - 1)


def holm_adjust(p_values):
    """Holm step-down adjustment. Returns list aligned with input order."""
    m = len(p_values)
    order = sorted(range(m), key=lambda i: p_values[i])
    adj = [0.0] * m
    running_max = 0.0
    for rank, idx in enumerate(order):
        val = min(1.0, (m - rank) * p_values[idx])
        running_max = max(running_max, val)
        adj[idx] = running_max
    return adj


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
    cli_args = argparse.Namespace(segment_by_length=False, no_rule_baseline=False, device=None,
                                  max_seq_len=0, folds=5, weights_dir=WEIGHTS_DIR,
                                  sidecar=None, per_user_npz=None, model_type="auto", attn=None,
                                  no_difficulty=False)
    _ap = argparse.ArgumentParser()
    _ap.add_argument("--segment-by-length", action="store_true",
                     help="Report per-activity-group AUC (low/mid/high, defined by tertile boundaries of sequence length)")
    _ap.add_argument("--no-rule-baseline", action="store_true",
                     help="Skip rule-based P@K baseline comparison")
    _ap.add_argument("--device", default=None, help='Override device detection: "cpu", "mps", or "cuda"')
    _ap.add_argument("--max-seq-len", type=int, default=0,
                     help="Truncate sequences to this length (0=no truncation, default 0)")
    _ap.add_argument("--folds", type=int, default=5,
                     help="Number of folds to evaluate (must match training fold count, default 5)")
    _ap.add_argument("--weights-dir", type=str, default=WEIGHTS_DIR,
                     help="Directory holding dkt_fold{i}.pt / graph_dkt_fold{i}.pt "
                          "(lets ablation variants be staged under canonical names)")
    _ap.add_argument("--sidecar", type=str, default=None,
                     help="Optional path to write per-fold arrays as JSON "
                          "(for cross-variant paired tests)")
    _ap.add_argument("--per-user-npz", type=str, default=None,
                     help="Optional path to save per-user P@K/N@K arrays (.npz) "
                          "for user-level paired bootstrap")
    _ap.add_argument("--model-type", type=str, default="auto",
                     choices=["auto", "dkt", "graph_dkt", "sakt", "dkvmn"],
                     help="'auto' reads model_type from the graph-side checkpoint "
                          "config (legacy checkpoints without it default to graph_dkt)")
    _ap.add_argument("--attn", type=str, default=None, choices=["sdpa", "naive"],
                     help="Override the attention backend for sakt checkpoints "
                          "(default: use the checkpoint's own setting)")
    _ap.add_argument("--no-difficulty", action="store_true",
                     help="Force difficulty-blinded evaluation for both sides "
                          "(default OFF; blinded checkpoints auto-apply it)")
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

    # Compute tertile boundaries from ORIGINAL (pre-truncation) sequence lengths.
    # Without this fix, --max-seq-len 2000 truncates all sequences and the high-activity
    # tertile becomes empty (truncation artifact, not real measurement).
    raw_sequences = load_csv_sequences(DATA, topic_graph, max_seq_len=0)
    raw_lengths = [len(s) for s in raw_sequences]
    low_boundary = int(np.percentile(raw_lengths, 33))
    mid_boundary = int(np.percentile(raw_lengths, 67))
    logger.info("Activity tertiles (pre-truncation lengths): low ≤ %d | mid %d-%d | high > %d",
                low_boundary, low_boundary + 1, mid_boundary, mid_boundary)
    # Note: groups defined by ORIGINAL activity level; training used --max-seq-len.

    # Per-activity-group result tracking (tertile-based)
    segment_results = {
        "low": {"dkt_aucs": [], "gdkt_aucs": [], "n": 0},
        "mid": {"dkt_aucs": [], "gdkt_aucs": [], "n": 0},
        "high": {"dkt_aucs": [], "gdkt_aucs": [], "n": 0},
    }

    # Difficulty-blinding status, printed at start. Each side auto-applies the
    # blinding recorded in its own checkpoint config ("blinded" vs "active";
    # legacy checkpoints without the key count as "active"); --no-difficulty
    # forces blinding on both sides. Train and eval share the single
    # collate_fn blind_difficulty path, so they cannot diverge.
    def _peek_difficulty(path):
        try:
            if os.path.exists(path):
                cfg = torch.load(path, map_location="cpu", weights_only=True).get("config", {})
                return cfg.get("difficulty", "active")
        except Exception:
            pass
        return "active"

    _dkt0 = _peek_difficulty(os.path.join(cli_args.weights_dir, "dkt_fold0.pt"))
    _gdkt0 = _peek_difficulty(os.path.join(cli_args.weights_dir, "graph_dkt_fold0.pt"))
    _dkt_blind_start = bool(cli_args.no_difficulty or _dkt0 == "blinded")
    _gdkt_blind_start = bool(cli_args.no_difficulty or _gdkt0 == "blinded")
    if _dkt_blind_start or _gdkt_blind_start:
        logger.info("difficulty: BLINDED (dkt_side=%s, graph_side=%s)",
                    "blinded" if _dkt_blind_start else "active",
                    "blinded" if _gdkt_blind_start else "active")
    else:
        logger.info("difficulty: ACTIVE")

    # Reproduce k-fold splits (seed=42, matching train_dkt.py defaults).
    # --folds controls both the split count and which weights to look for.
    folds = kfold_split(sequences, k=cli_args.folds, seed=42)

    # Fold indices to evaluate
    fold_indices = list(range(cli_args.folds))

    all_results = []
    gdkt_variant = None  # e.g. "directed" or the ablation adjacency_mode

    for fi in fold_indices:
        _, val_seqs = folds[fi]
        logger.info("=== Fold %d/%d (val: %d users) ===", fi + 1, cli_args.folds, len(val_seqs))

        val_dataset = DKTDataset(val_seqs, topic_graph)
        val_loader = DataLoader(val_dataset, batch_size=32, shuffle=False, collate_fn=lambda x: x)

        dkt_path = os.path.join(cli_args.weights_dir, f"dkt_fold{fi}.pt")
        gdkt_path = os.path.join(cli_args.weights_dir, f"graph_dkt_fold{fi}.pt")

        results: dict[str, object] = {"fold": fi, "val_users": len(val_seqs)}
        dkt_loaded = False
        gdkt_loaded = False
        want_per_user = cli_args.per_user_npz is not None
        fold_user_ids = [f"fold{fi}_u{i}" for i in range(len(val_seqs))]

        # --- DKT evaluation ---
        if os.path.exists(dkt_path):
            dkt_model = DKTModel.load(dkt_path)
            if dkt_model is None:
                logger.warning("  DKT load returned None for %s", dkt_path)
                continue
            dkt_model.to(device)
            dkt_blind = bool(cli_args.no_difficulty
                             or dkt_model.config.get("difficulty", "active") == "blinded")
            dkt_metrics = evaluate_model(dkt_model, val_loader, topic_graph, device,
                                         return_per_user=want_per_user,
                                         user_ids=fold_user_ids if want_per_user else None,
                                         blind_difficulty=dkt_blind)
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
            # Detect checkpoint kind. Legacy checkpoints predate "model_type":
            # adjacency_mode present -> ablation graph_dkt, else directed graph_dkt.
            ckpt_keys = torch.load(gdkt_path, map_location="cpu", weights_only=True).get("config", {})
            if cli_args.model_type == "auto":
                model_type = ckpt_keys.get("model_type", "graph_dkt")
            else:
                model_type = cli_args.model_type
                logger.info("  --model-type override: %s", model_type)
            if model_type == "sakt":
                from models.sakt import SAKTStyleModel
                gdkt_model = SAKTStyleModel.load(gdkt_path)
                if gdkt_model is not None and cli_args.attn is not None:
                    gdkt_model.set_attn(cli_args.attn)
                    logger.info("  --attn override: %s", cli_args.attn)
            elif model_type == "dkvmn":
                from models.dkvmn import DKVMNStyleModel
                gdkt_model = DKVMNStyleModel.load(gdkt_path)
            elif model_type == "dkt":
                gdkt_model = DKTModel.load(gdkt_path)
            elif "adjacency_mode" in ckpt_keys:
                # AblationGraphDKTModel.load avoids TypeError from the extra kwarg.
                gdkt_model = AblationGraphDKTModel.load(gdkt_path, topic_graph=topic_graph)
            else:
                gdkt_model = GraphDKTModel.load(gdkt_path, topic_graph=topic_graph)
            if gdkt_model is None:
                logger.warning("  Graph-DKT load returned None for %s", gdkt_path)
                continue
            gdkt_model.to(device)
            gdkt_blind = bool(cli_args.no_difficulty
                              or ckpt_keys.get("difficulty", "active") == "blinded")
            gdkt_metrics = evaluate_model(gdkt_model, val_loader, topic_graph, device,
                                          return_per_user=want_per_user,
                                          user_ids=fold_user_ids if want_per_user else None,
                                          blind_difficulty=gdkt_blind)
            gdkt_loaded = True
            if gdkt_variant is None:
                if model_type in ("sakt", "dkvmn", "dkt"):
                    gdkt_variant = model_type
                else:
                    gdkt_variant = ckpt_keys.get("adjacency_mode", "directed")
            if want_per_user:
                results["dkt_per_user"] = dkt_metrics.get("per_user", []) if dkt_loaded else []
                results["gdkt_per_user"] = gdkt_metrics.get("per_user", [])
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
                    dkt_seg = evaluate_model(dkt_model, seg_loader, topic_graph, device,
                                               blind_difficulty=dkt_blind)
                    gdkt_seg = evaluate_model(gdkt_model, seg_loader, topic_graph, device,
                                              blind_difficulty=gdkt_blind)
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

    # ---- Per-fold ranking metrics (both models), then mean±std (ddof=1) ----
    K_LIST = sorted(RANKING_K_VALUES)
    g_label = gdkt_variant if gdkt_variant else "graph-side"
    for mname, dkt_dict, gdkt_dict in [
        ("P@K", dkt_p_at_k, gdkt_p_at_k),
        ("N@K", dkt_n_at_k, gdkt_n_at_k),
    ]:
        print("\n" + "=" * 100)
        print(f"PER-FOLD {mname} — DKT vs {g_label}")
        print("=" * 100)
        header = f"{'Fold':>5}"
        for k in K_LIST:
            header += f"  {'DKT@'+str(k):>10}  {('G@'+str(k)):>10}"
        print(header)
        print("-" * 100)
        for fi in range(len(all_results)):
            line = f"{all_results[fi].get('fold', fi):>5d}"
            for k in K_LIST:
                d = dkt_dict[k][fi] if fi < len(dkt_dict[k]) else float("nan")
                g = gdkt_dict[k][fi] if fi < len(gdkt_dict[k]) else float("nan")
                line += f"  {d:>10.4f}  {g:>10.4f}"
            print(line)
        print("-" * 100)
        line = f"{'Mean':>5}"
        for k in K_LIST:
            d_mean = float(np.mean(dkt_dict[k])) if dkt_dict[k] else float("nan")
            g_mean = float(np.mean(gdkt_dict[k])) if gdkt_dict[k] else float("nan")
            line += f"  {d_mean:>10.4f}  {g_mean:>10.4f}"
        print(line)
        line = f"{'Std':>5}"
        for k in K_LIST:
            d_std = float(np.std(dkt_dict[k], ddof=1)) if len(dkt_dict[k]) > 1 else 0.0
            g_std = float(np.std(gdkt_dict[k], ddof=1)) if len(gdkt_dict[k]) > 1 else 0.0
            line += f"  {d_std:>10.4f}  {g_std:>10.4f}"
        print(line)
        print("=" * 100)

    # ---- Within-run paired t-tests: graph-side vs DKT (n=folds, df=folds-1) ----
    # Cross-variant families (directed vs {no_graph, undirected, dense}) need
    # per-fold values from SEPARATE runs; those live in paired_stats.py which
    # reads the --sidecar files saved below.  This block tests this run's
    # graph-side variant against DKT on the same folds.
    _tt_backend = "scipy.stats.ttest_rel" if _scipy_ttest_rel is not None else "hand-rolled"
    _ptest_names, _ptest_raw = [], []
    _ptest_rows = []  # (name, mean_diff, t)
    if dkt_aucs and gdkt_aucs and len(dkt_aucs) == len(gdkt_aucs):
        t, p = paired_ttest(gdkt_aucs, dkt_aucs)
        _ptest_names.append("AUC")
        _ptest_raw.append(p)
        _ptest_rows.append(("AUC", float(np.mean(gdkt_aucs) - np.mean(dkt_aucs)), t))
    for mname, dkt_dict, gdkt_dict in [("P", dkt_p_at_k, gdkt_p_at_k),
                                       ("N", dkt_n_at_k, gdkt_n_at_k)]:
        for k in K_LIST:
            if dkt_dict[k] and gdkt_dict[k] and len(dkt_dict[k]) == len(gdkt_dict[k]):
                t, p = paired_ttest(gdkt_dict[k], dkt_dict[k])
                _ptest_names.append(f"{mname}@{k}")
                _ptest_raw.append(p)
                _ptest_rows.append((f"{mname}@{k}",
                                    float(np.mean(gdkt_dict[k]) - np.mean(dkt_dict[k])), t))
    _ptest_holm = holm_adjust(_ptest_raw) if _ptest_raw else []
    print("\n" + "=" * 70)
    print(f"PAIRED TESTS — {g_label} vs DKT (n={len(dkt_aucs)} folds, "
          f"df={len(dkt_aucs) - 1}; {_tt_backend}; Holm across {len(_ptest_names)} metrics)")
    print("=" * 70)
    print(f"{'Metric':<10} {'mean_diff':>10} {'t':>10} {'p_raw':>10} {'p_holm':>10}")
    print("-" * 70)
    for (name, md, t), p, ph in zip(_ptest_rows, _ptest_raw, _ptest_holm):
        print(f"{name:<10} {md:>+10.4f} {t:>10.3f} {p:>10.4f} {ph:>10.4f}")
    print("=" * 70)

    # ---- Sidecar JSON with per-fold arrays (for cross-variant paired tests) ----
    if cli_args.sidecar:
        sidecar = {
            "variant": g_label,
            "max_seq_len": cli_args.max_seq_len,
            "folds": [r.get("fold") for r in all_results],
            "val_users": [r.get("val_users") for r in all_results],
            "dkt_auc": list(map(float, dkt_aucs)),
            "gdkt_auc": list(map(float, gdkt_aucs)),
        }
        for k in K_LIST:
            sidecar[f"dkt_p@{k}"] = list(map(float, dkt_p_at_k[k]))
            sidecar[f"gdkt_p@{k}"] = list(map(float, gdkt_p_at_k[k]))
            sidecar[f"dkt_n@{k}"] = list(map(float, dkt_n_at_k[k]))
            sidecar[f"gdkt_n@{k}"] = list(map(float, gdkt_n_at_k[k]))
            sidecar[f"rule_p@{k}"] = list(map(float, rule_p_at_k[k]))
            sidecar[f"rule_n@{k}"] = list(map(float, rule_n_at_k[k]))
        with open(cli_args.sidecar, "w") as f:
            json.dump(sidecar, f, indent=2)
        logger.info("Wrote sidecar %s", cli_args.sidecar)

    # ---- Per-user .npz (pooled test users; each user is in exactly one fold) ----
    if cli_args.per_user_npz:
        _pu_ids, _pu_n = [], []
        _pu_dkt = {k: [] for k in K_LIST}
        _pu_gdkt = {k: [] for k in K_LIST}
        for r in all_results:
            for rec_d, rec_g in zip(r.get("dkt_per_user", []), r.get("gdkt_per_user", [])):
                assert rec_d["user_id"] == rec_g["user_id"], "per-user row misaligned"
                _pu_ids.append(str(rec_d["user_id"]))
                _pu_n.append(int(rec_d["n_valid"]))
                for k in K_LIST:
                    _pu_dkt[k].append(float(rec_d["precision_at_k"][k]))
                    _pu_gdkt[k].append(float(rec_g["precision_at_k"][k]))
        _npz = {"user_id": np.array(_pu_ids), "n_valid": np.array(_pu_n, dtype=np.int64)}
        for k in K_LIST:
            _npz[f"dkt_p@{k}"] = np.array(_pu_dkt[k])
            _npz[f"gdkt_p@{k}"] = np.array(_pu_gdkt[k])
        np.savez(cli_args.per_user_npz, **_npz)
        logger.info("Wrote per-user npz %s (%d users)", cli_args.per_user_npz, len(_pu_ids))

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
