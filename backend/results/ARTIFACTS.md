# Results artifacts — tracking policy

This directory holds the evaluation evidence for the paper. Small, reviewable text
(per-fold metrics, sidecars, stats tables) is tracked in git. Large binaries are **not**.

## Tracked in git

- `eval_*_perfolds.txt` — per-fold AUC / P@1 / P@3 / P@5 / P@10 / NDCG (the numbers the paper cites)
- `eval_*_perfolds.sidecar.json` — run metadata (config, folds, seed, argv)
- `ablation_stats_*.txt`, `alt_comparison_2k.txt`, `alt_models_criteria.txt` — paired tests, Holm, bootstrap CIs
- `eval_output*.txt`, `eval_{directed,dense,no_graph,undirected}_{2k}.txt` — legacy single-run logs

These are sufficient to read and cite every number in the paper.

## NOT tracked in git (kept locally, gitignored)

20 binary files, 10.7 MB total. They are regenerable and would bloat every
clone; they are not needed to read the results, only to re-run `paired_stats.py`'s
per-user bootstrap sensitivity check or to re-score the models.

| File | Size | sha256 (first 16) |
|---|---|---|
| `sakt_fold0.pt` | 1.6 MB | `c89b95a33c9b264e` |
| `sakt_fold1.pt` | 1.6 MB | `2a475c2d0da04408` |
| `sakt_fold2.pt` | 1.6 MB | `3515ea88e32d9f74` |
| `sakt_fold3.pt` | 1.6 MB | `0525c6f2ed9ae168` |
| `sakt_fold4.pt` | 1.6 MB | `45aee20b3a04ca03` |
| `dkvmn_fold0.pt` | 288 KB | `5906d6ed4496fa35` |
| `dkvmn_fold1.pt` | 288 KB | `b8c289f1d7dd05ba` |
| `dkvmn_fold2.pt` | 288 KB | `05222cb56f88e52b` |
| `dkvmn_fold3.pt` | 288 KB | `5c376da1b3c77438` |
| `dkvmn_fold4.pt` | 288 KB | `7d66323b2f5a0204` |
| `eval_dense_10k_perfolds.peruser.npz` | 149 KB | `6aef02f2b01d5c2e` |
| `eval_dense_2k_perfolds.peruser.npz` | 149 KB | `bf55a77bfdb8b591` |
| `eval_directed_10k_perfolds.peruser.npz` | 149 KB | `896a78983dab54b2` |
| `eval_directed_2k_perfolds.peruser.npz` | 149 KB | `c1774a1cf6065961` |
| `eval_dkvmn_2k_perfolds.peruser.npz` | 149 KB | `b84008d5b8b6c81b` |
| `eval_no_graph_10k_perfolds.peruser.npz` | 149 KB | `4a6f4a14faf83676` |
| `eval_no_graph_2k_perfolds.peruser.npz` | 149 KB | `2240ce016952ee73` |
| `eval_sakt_2k_perfolds.peruser.npz` | 149 KB | `0ee22e35dbc5eae0` |
| `eval_undirected_10k_perfolds.peruser.npz` | 149 KB | `b3094d6df48718f5` |
| `eval_undirected_2k_perfolds.peruser.npz` | 149 KB | `1cb2908e6f9e7e2d` |

Baseline blob checksums (full sha256) are in the commit message that introduced this file.

## How to regenerate

Weights come from the Kaggle notebooks (`backend/training/kaggle_alt_sakt.ipynb`,
`kaggle_alt_dkvmn.ipynb`); download `results.zip` from the run and extract into
`backend/weights/`.

Per-user arrays come from `eval_folds.py` with `--per-user-npz`, e.g.:

```bash
python3 training/eval_folds.py --max-seq-len 10000 --segment-by-length \
  --per-user-npz results/eval_directed_10k_perfolds.peruser.npz
```

`training/paired_stats.py` reads `eval_{variant}_{config}_perfolds.peruser.npz` from
`--results-dir` (default `results/`); it exits nonzero if a file is missing.

## Backup warning

These files exist only on the machine that produced them. They are `gitignore`d, so a
fresh clone does **not** have them. Copy `backend/weights/*.pt` and
`backend/results/*.npz` somewhere durable (Kaggle dataset, cloud storage) before the
next machine change.
