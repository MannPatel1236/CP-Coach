#!/usr/bin/env python3
"""Cross-variant paired tests from eval_folds.py --sidecar / --per-user-npz outputs.

Reads one sidecar JSON per variant (per-fold AUC + P@K/N@K) and one per-user
.npz per variant, then prints:
  1. paired t-tests (n=5 folds, df=4) of the reference variant against each
     comparator for AUC and P@5, with raw and Holm-adjusted p in one table;
  2. a user-level paired bootstrap (10,000 resamples, pooled test users) for
     the P@5 difference reference-minus-comparator, with 95% CIs.

Fold-level t-tests are anti-conservative because folds share training data;
Holm correction is applied across the comparisons in each table.

Usage:
    python3 -m training.paired_stats --results-dir backend/results --config 10k
    python3 -m training.paired_stats --results-dir backend/results --config 2k

Expected files (written by the Task A eval runs):
    eval_{directed,no_graph,undirected,dense}_{config}_perfolds.sidecar.json
    eval_{directed,no_graph,undirected,dense}_{config}_perfolds.peruser.npz
"""

import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from training.eval_folds import holm_adjust, paired_ttest  # noqa: E402

VARIANTS = ["directed", "no_graph", "undirected", "dense"]
REF = "directed"
BOOTSTRAP_RESAMPLES = 10_000
BOOTSTRAP_SEED = 42


def load_sidecar(results_dir, variant, config):
    path = os.path.join(results_dir, f"eval_{variant}_{config}_perfolds.sidecar.json")
    with open(path) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results-dir", required=True)
    ap.add_argument("--config", required=True, help="'2k' or '10k' (filename infix)")
    ap.add_argument("--ref", default=REF)
    ap.add_argument("--resamples", type=int, default=BOOTSTRAP_RESAMPLES)
    ap.add_argument("--seed", type=int, default=BOOTSTRAP_SEED)
    args = ap.parse_args()

    sides = {v: load_sidecar(args.results_dir, v, args.config) for v in VARIANTS}

    # Sanity: DKT side must be identical across all four runs (same weights).
    dkt_ref = np.array(sides[args.ref]["dkt_auc"])
    for v in VARIANTS:
        if v == args.ref:
            continue
        d = np.array(sides[v]["dkt_auc"])
        maxdiff = float(np.max(np.abs(d - dkt_ref)))
        print(f"sanity DKT-AUC {args.ref} vs {v}: max|diff| = {maxdiff:.6f}")
        assert maxdiff < 1e-9, f"DKT side differs between {args.ref} and {v} runs!"

    ref = sides[args.ref]
    comparators = [v for v in VARIANTS if v != args.ref] + ["dkt"]
    # "dkt" comparator uses the DKT side of the ref run (same folds, same weights).

    def series(variant, key):
        if variant == "dkt":
            return np.array(ref["dkt_" + key[5:] if key.startswith("gdkt_") else key])
        s = sides[variant]
        return np.array(s[key])

    ref_auc = np.array(ref["gdkt_auc"])
    ref_p5 = np.array(ref["gdkt_p@5"])

    print()
    print(f"CROSS-VARIANT PAIRED TESTS — config {args.config}, "
          f"ref={args.ref} (graph side), n=5 folds, df=4")
    print("Holm adjusted across the 8 comparisons in this table. "
          "Fold-level t-tests are anti-conservative (folds share training data).")
    print(f"{'comparison':<28} {'metric':<6} {'ref_mean':>10} {'cmp_mean':>10} "
          f"{'diff':>10} {'t':>8} {'p_raw':>10} {'p_holm':>10}")
    names, raws, rows = [], [], []
    for cmp_v in comparators:
        for metric, r, c in [("AUC", ref_auc, series(cmp_v, "gdkt_auc")),
                             ("P@5", ref_p5, series(cmp_v, "gdkt_p@5"))]:
            t, p = paired_ttest(r, c)
            names.append(f"{args.ref}-vs-{cmp_v}")
            raws.append(p)
            rows.append((cmp_v, metric, float(np.mean(r)), float(np.mean(c)),
                         float(np.mean(r) - np.mean(c)), t, p))
    def _pfmt(p):
        return f"{p:.2e}" if p < 0.0001 else f"{p:.4f}"

    holms = holm_adjust(raws)
    for (cmp_v, metric, rm, cm, diff, t, p), ph in zip(rows, holms):
        print(f"{args.ref}-vs-{cmp_v:<22} {metric:<6} {rm:>10.4f} {cm:>10.4f} "
              f"{diff:>+10.4f} {t:>8.3f} {_pfmt(p):>10} {_pfmt(ph):>10}")

    # ---- User-level paired bootstrap on P@5 ----
    print()
    print(f"USER-LEVEL PAIRED BOOTSTRAP — P@5 {args.ref} minus comparator, "
          f"{args.resamples} resamples, 95% CI (unweighted mean over pooled users)")
    npz = {}
    for v in VARIANTS:
        path = os.path.join(args.results_dir, f"eval_{v}_{args.config}_perfolds.peruser.npz")
        npz[v] = dict(np.load(path, allow_pickle=True))
    # Align users by id across runs.
    ref_ids = [str(x) for x in npz[args.ref]["user_id"]]
    ref_map = {u: i for i, u in enumerate(ref_ids)}
    rng = np.random.default_rng(args.seed)
    print(f"{'comparison':<28} {'n_users':>8} {'mean_diff':>10} {'CI_lo':>10} {'CI_hi':>10}")
    for cmp_v in comparators:
        if cmp_v == "dkt":
            cmp_arr = npz[args.ref]["dkt_p@5"]
            cmp_ids = ref_ids
        else:
            cmp_arr = npz[cmp_v]["gdkt_p@5"]
            cmp_ids = [str(x) for x in npz[cmp_v]["user_id"]]
        common = [u for u in ref_ids if u in set(cmp_ids)]
        cmp_map = {u: i for i, u in enumerate(cmp_ids)}
        r = np.array([float(npz[args.ref]["gdkt_p@5"][ref_map[u]]) for u in common])
        c = np.array([float(cmp_arr[cmp_map[u]]) for u in common])
        diffs = r - c
        n = len(diffs)
        idx = rng.integers(0, n, size=(args.resamples, n))
        means = diffs[idx].mean(axis=1)
        lo, hi = np.percentile(means, [2.5, 97.5])
        print(f"{args.ref}-vs-{cmp_v:<22} {n:>8d} {float(np.mean(diffs)):>+10.4f} "
              f"{float(lo):>+10.4f} {float(hi):>+10.4f}")


if __name__ == "__main__":
    main()
