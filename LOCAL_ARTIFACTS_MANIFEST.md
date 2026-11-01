# CP Coach — Local-Only Artifacts Backup Manifest

Generated: 2026-08-26 · **Revised: 2026-11-01** (post-cleanup; see "Removed" below)

These files are **gitignored and exist only on this machine**. They are not
pushed to GitHub and are not covered by CI. Copy them to durable offsite storage
(private Kaggle dataset, cloud bucket, or similar) and keep this manifest with
the backup.

## Weights and model training artifacts — `backend/weights/` (40 MB total)

| Path | Size | Notes |
|------|------|-------|
| `backend/weights/dkt_fold{0..4}.pt` | 5 × 576K | 2k DKT baseline folds (local-only) |
| `backend/weights/graph_dkt_fold{0..4}.pt` | 5 × 636K | 2k Graph-DKT folds (local-only) |
| `backend/weights/dkt_10k_fold{0..4}.pt` | 5 × 576K | 10k DKT baseline folds (local-only) |
| `backend/weights/ablation_dense_10k_fold{0..4}.pt` | 5 × 636K | 10k dense-adjacency ablation folds |
| `backend/weights/ablation_no_graph_10k_fold{0..4}.pt` | 5 × 636K | 10k no-graph ablation folds |
| `backend/weights/ablation_undirected_10k_fold{0..4}.pt` | 5 × 636K | 10k undirected-adjacency ablation folds |
| `backend/weights/ablation_dense_fold{0..4}.pt` | 5 × 636K | 2k dense-ablation folds |
| `backend/weights/ablation_no_graph_fold{0..4}.pt` | 5 × 636K | 2k no-graph ablation folds |
| `backend/weights/ablation_undirected_fold{0..4}.pt` | 5 × 636K | 2k undirected-ablation folds |
| `backend/weights/sakt_fold{0..4}.pt` | 5 × 1.6M | 2k SAKT-style baseline (§5 alt-architectures) |
| `backend/weights/dkvmn_fold{0..4}.pt` | 5 × 288K | 2k DKVMN-style baseline (§5 alt-architectures) |

Tracked/shipped weights (NOT in this list):

- `backend/weights/graph_dkt_10k_fold{0..4}.pt` — force-added to git; production ensemble.

The SAKT/DKVMN folds are untracked as of the `exp/defense-evidence` cleanup
(they were force-added over `weights/*.pt`). See `backend/results/ARTIFACTS.md`.

## Per-user prediction arrays — `backend/results/` (1.8 MB)

Ten `eval_*_perfolds.peruser.npz` files (152 KB each), inputs to
`training/paired_stats.py`'s user-level bootstrap. Untracked; per-file checksums
in `backend/results/ARTIFACTS.md`.

## Paper source

| Path | Size | Notes |
|------|------|-------|
| `_paper/tex/` | ~450K | Live LaTeX source (abstract … conclusion, references.bib) |
| `_paper/tex/main.pdf` | 306K | Compiled PDF — **stale**, dated 2026-07-18, predates the Oct 2026 experiments.tex/conclusion.tex revisions; needs a recompile |
| `_paper/archive/tex-snapshots-2026-07-18_and_2026-08-01.tar.gz` | 48K | Preserved text of the two superseded paper snapshots (July packaged source + August review copy), kept as ~48 KB of tex text after the bulky originals were deleted |

## Training data — `backend/data/` (356 MB)

| Path | Size | Notes |
|------|------|-------|
| `backend/data/training.csv` | 308M | 5.17M-row training corpus — the working copy training scripts read |
| `backend/data/training.csv.zip` | 36M | Compressed copy; decompresses byte-identical to `training.csv`. Keep as the uploadable backup |
| `backend/data/smoke_50.csv` | 12M | Smoke-test training slice |

## Removed on 2026-11-01 (cleanup)

Deleted after hash verification; kept here as a record of what no longer exists.

| Path | Size | Why |
|------|------|-----|
| `backend/weights/backup_2k/` | 5.9M | All 10 files byte-identical to the live `dkt_fold*.pt` / `graph_dkt_fold*.pt` |
| `backend/weights/archived-buggy/` | 15M | Weights from the broken temporal-alignment bug — unusable by rule 12 |
| `backend/weights/smoke_{50,dkt_fold0}.pt`, `test_smoke.pt` | 1.8M | Throwaway smoke-test artifacts |
| `_paper/results_10k_{dense,no_graph,undirected}.zip` | 10M | All 15 members hashed identical to `backend/weights/ablation_*_10k_fold*.pt` on disk |
| `_paper/main.pdf` | 312K | Identical sha256 to `_paper/tex/main.pdf` |
| `_paper/latex_paper.zip` | 336K | July tex snapshot; tex text preserved in `_paper/archive/` |
| `.paper_review/` | 7M | August review copy: stale tex superseded by `_paper/tex/`, plus a duplicate 10-file weight set |
| `backend/weights_staging/` | 0 | Ten directories of symlinks into `backend/weights/` |
| `backend/.venv/` | 910M | Python 3.14 venv lacking torch-geometric; `backend/venv` (3.11, torch 2.2.2 + PyG 2.5.3) matches Docker and pyrightconfig |
| `dist/`, `__pycache__`, `.DS_Store` | ~3M | Regenerable build/bytecode cruft |

## Suggested destination

Private Kaggle dataset or personal cloud bucket. If no cloud credentials are
configured locally, a force-added compressed archive under a protected repo path
is an in-repo fallback, but it bloats git history.

## Verification

```bash
du -sh backend/weights backend/results backend/data _paper
ls backend/weights/*.pt | wc -l        # expect 60
ls backend/results/*.peruser.npz | wc -l   # expect 10
```
