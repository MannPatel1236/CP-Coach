# CP Coach — Local-Only Artifacts Backup Manifest

Generated: 2026-08-26

These files are **gitignored and exist only on this machine**. They are not
pushed to GitHub and are not covered by CI. Copy them to durable offsite storage
(private Kaggle dataset, cloud bucket, or similar) and keep this manifest with
the backup.

## Weights and model training artifacts

| Path | Size | Notes |
|------|------|-------|
| `backend/weights/backup_2k/` | 5.9M | 2k sequence-length fold-weight backups |
| `backend/weights/archived-buggy/` | 14M | Old weights with broken temporal alignment — DO NOT USE for inference |
| `backend/weights/dkt_fold{0..4}.pt` | 5 × 576K | 2k DKT baseline folds (local-only) |
| `backend/weights/graph_dkt_fold{0..4}.pt` | 5 × 636K | 2k Graph-DKT folds (local-only) |
| `backend/weights/dkt_10k_fold{0..4}.pt` | 5 × 576K | 10k DKT baseline folds (local-only) |
| `backend/weights/ablation_dense_10k_fold{0..4}.pt` | 5 × 636K | 10k dense-adjacency ablation folds |
| `backend/weights/ablation_no_graph_10k_fold{0..4}.pt` | 5 × 636K | 10k no-graph ablation folds |
| `backend/weights/ablation_undirected_10k_fold{0..4}.pt` | 5 × 636K | 10k undirected-adjacency ablation folds |
| `backend/weights/ablation_dense_fold{0..4}.pt` | 5 × 636K | 2k dense-ablation folds |
| `backend/weights/ablation_no_graph_fold{0..4}.pt` | 5 × 636K | 2k no-graph ablation folds |
| `backend/weights/ablation_undirected_fold{0..4}.pt` | 5 × 636K | 2k undirected-ablation folds |
| `backend/weights/smoke_dkt_fold0.pt` | 576K | Smoke-test weight |
| `backend/weights/smoke_50.pt` | 640K | Smoke-test weight |
| `backend/weights/test_smoke.pt` | 576K | Smoke-test weight |

Tracked/shipped weights (NOT in this list):

- `backend/weights/graph_dkt_10k_fold{0..4}.pt` — force-added to git; production ensemble.

## Paper source and result archives

| Path | Size | Notes |
|------|------|-------|
| `_paper/latex_paper.zip` | 332K | Packaged LaTeX source |
| `_paper/main.pdf` | 308K | Compiled paper PDF |
| `_paper/results_10k_dense.zip` | 3.1M | 10k dense ablation fold artifacts |
| `_paper/results_10k_no_graph.zip` | 3.1M | 10k no-graph ablation fold artifacts |
| `_paper/results_10k_undirected.zip` | 3.1M | 10k undirected ablation fold artifacts |

## Training data

| Path | Size | Notes |
|------|------|-------|
| `backend/data/training.csv.zip` | 36M | 5.17M-row training corpus (compressed) |
| `backend/data/training.csv` | 323M | Same corpus, uncompressed (redundant with .zip) |
| `backend/data/smoke_50.csv` | 12M | Smoke-test training slice |

## Suggested destination

Private Kaggle dataset or personal cloud bucket. If no cloud credentials are
configured locally, a force-added compressed archive under a protected repo path
is an in-repo fallback, but it bloats git history.

## Verification

To reproduce this manifest's size list:

```bash
du -sh backend/weights/backup_2k backend/weights/archived-buggy \
  backend/weights/dkt_fold*.pt backend/weights/graph_dkt_fold*.pt \
  backend/weights/ablation_*_fold*.pt _paper/*.zip _paper/main.pdf \
  backend/data/training.csv.zip backend/data/training.csv backend/data/smoke_50.csv
```
