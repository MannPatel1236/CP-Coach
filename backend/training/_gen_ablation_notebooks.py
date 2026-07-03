"""Generate three Kaggle notebooks for the ablation study.

Base template: backend/training/kaggle_notebook.ipynb
Variants: no_graph, undirected, dense (each uses --adjacency-mode <MODE>).

We modify the base notebook JSON in four places:
  1. cell-0  title cell             → variant name
  2. cell-10 smoke test             → graph_dkt with adjacency mode
  3. cell-11/12 (DKT retrain)       → RESTORE pre-trained DKT weights from a
                                       Kaggle input dataset instead of retraining.
                                       Saves ~1h × 3 notebooks = 3h of GPU time.
  4. cell-14 Graph-DKT retrain      → 3 folds × 50 epochs with adjacency mode
  5. cell-16 eval                   → copies ablation_<mode>_foldN → graph_dkt_foldN
                                       and runs eval_folds.py normally
  6. cell-18 packaging              → include ablation_<mode>_fold*.pt outputs

Usage (one-time, before first ablation run):
  Upload `weights/dkt_fold{0,1,2,3,4}.pt` (the existing 5-fold DKT weights) to
  Kaggle as a private dataset named `dkt-weights-5fold`. Then in each notebook:
  Add Data → Your Datasets → select `dkt-weights-5fold`.
  The notebooks will auto-discover and restore them in CELL 5.
"""
import json
import os

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(BACKEND, "training", "kaggle_notebook.ipynb")
OUT_DIR = os.path.join(BACKEND, "training")

VARIANTS = [
    {
        "mode": "no_graph",
        "title": "Kaggle Notebook: Graph-DKT Ablation — no_graph (identity only)",
        "runtime": "~1.5 hours (DKT retrain replaced with restored weights)",
        "gpu": "GPU T4 x1",
        "fname": "kaggle_ablation_no_graph.ipynb",
    },
    {
        "mode": "undirected",
        "title": "Kaggle Notebook: Graph-DKT Ablation — undirected (bidirectional edges)",
        "runtime": "~1.5 hours (DKT retrain replaced with restored weights)",
        "gpu": "GPU T4 x1",
        "fname": "kaggle_ablation_undirected.ipynb",
    },
    {
        "mode": "dense",
        "title": "Kaggle Notebook: Graph-DKT Ablation — dense (fully connected)",
        "runtime": "~2 hours (DKT retrain replaced with restored weights)",
        "gpu": "GPU T4 x2",
        "fname": "kaggle_ablation_dense.ipynb",
    },
]


def make_ablation_notebook(mode: str, title: str, runtime: str, gpu: str, fname: str):
    with open(TEMPLATE) as f:
        nb = json.load(f)

    title_cell = (
        "# ============================================================\n"
        f"# Kaggle Notebook: Graph-DKT Ablation — {mode}\n"
        "# ============================================================\n"
        f"# RUN IN ORDER. Each section is a separate cell.\n"
        f"# Expected runtime: {runtime}\n"
        f"# Accelerator recommendation: {gpu}\n"
        "#\n"
        "# ⏱️  DKT weights are RESTORED (not retrained).\n"
        "# Before running: upload weights/dkt_fold{0-4}.pt to Kaggle as a private\n"
        "# dataset named 'dkt-weights-5fold', then 'Add Data → Your Datasets'.\n"
        "# ============================================================"
    )

    # Cell 0 — title
    nb["cells"][0]["source"] = title_cell

    # Cell 9 (markdown smoke test heading) — tweak copy
    nb["cells"][9]["source"] = f"### CELL 4 — Smoke test for graph_dkt --adjacency-mode {mode} (3 epochs, 1 fold)"

    # Cell 10 — smoke test command (graph_dkt with adjacency mode, 3 epochs, 1 fold)
    smoke_src = (
        f"%cd /kaggle/working/CP-Coach/backend\n"
        f"!python3 -m training.train_dkt \\\n"
        f"  --data data/training.csv --model graph_dkt \\\n"
        f"  --adjacency-mode {mode} \\\n"
        f"  --epochs 3 --folds 1 --out weights/ablation_smoke_{mode}.pt \\\n"
        f"  --batch 16 --device cuda --max-seq-len 2000\n"
    )
    nb["cells"][10]["source"] = smoke_src

    # ── Replace cells 11 (markdown) and 12 (code) with DKT-weight restoration ──
    # Cell 11 — was DKT retrain heading; replace with restoration heading
    nb["cells"][11]["source"] = (
        "### CELL 5 — Restore pre-trained DKT weights (no retrain)\n"
        "\n"
        "**Why:** DKT retraining takes ~1h per notebook. We've already trained 5-fold DKT\n"
        "weights elsewhere (the canonical baseline at AUC 0.9674). Upload those once as a\n"
        "private Kaggle dataset (`dkt-weights-5fold`) and this notebook restores them in seconds.\n"
        "\n"
        "Saves ~1h × 3 ablation notebooks = ~3h of GPU time across the whole ablation study."
    )
    nb["cells"][11]["cell_type"] = "markdown"

    # Cell 12 — replace with code cell that copies weights from /kaggle/input
    restore_src = (
        "# Restore pre-trained 5-fold DKT weights from the Kaggle input dataset.\n"
        "# Dataset name convention: 'dkt-weights-5fold' (upload weights/dkt_fold{0-4}.pt there once).\n"
        "import glob, os, shutil\n"
        "\n"
        "os.makedirs('weights', exist_ok=True)\n"
        "found_any = False\n"
        "for d in glob.glob('/kaggle/input/dkt-weights-5fold*'):\n"
        "    for f in glob.glob(os.path.join(d, 'dkt_fold*.pt')):\n"
        "        shutil.copy(f, 'weights/')\n"
        "        print(f'Restored: {f}')\n"
        "        found_any = True\n"
        "\n"
        "if not found_any:\n"
        "    raise FileNotFoundError(\n"
        "        \"DKT weights dataset not found in /kaggle/input/.\\n\"\n"
        "        \"Upload weights/dkt_fold{0,1,2,3,4}.pt as a private Kaggle dataset named\\n\"\n"
        "        \"'dkt-weights-5fold', then 'Add Data → Your Datasets' before running this cell.\"\n"
        "    )\n"
        "\n"
        "restored = sorted(glob.glob('weights/dkt_fold*.pt'))\n"
        "print(f'\\nRestored {len(restored)} DKT fold weights: {[os.path.basename(f) for f in restored]}')\n"
    )
    nb["cells"][12]["source"] = restore_src
    nb["cells"][12]["cell_type"] = "code"
    # Clear any output that may have been carried over from the template
    if "outputs" in nb["cells"][12]:
        nb["cells"][12]["outputs"] = []
    if "execution_count" in nb["cells"][12]:
        nb["cells"][12]["execution_count"] = None

    # Cell 13 (markdown Graph-DKT retrain heading) — tweak copy
    nb["cells"][13]["source"] = (
        f"### CELL 6 — Graph-DKT full retrain, adjacency-mode {mode} (5 folds × 50 epochs)"
    )

    # Cell 14 — full retrain command (5 folds × 50 epochs)
    full_src = (
        f"# Run in foreground so that Kaggle's background commit blocks and runs to completion.\n"
        f"# Expected runtime: {runtime}.\n"
        f"\n"
        f"!python3 -m training.train_dkt \\\n"
        f"  --data data/training.csv --model graph_dkt \\\n"
        f"  --adjacency-mode {mode} \\\n"
        f"  --epochs 50 --folds 5 --out weights/ablation_{mode}.pt \\\n"
        f"  --batch 16 --device cuda --max-seq-len 2000\n"
    )
    nb["cells"][14]["source"] = full_src

    # Cell 16 — eval command: rename ablation_<mode>_foldN.pt → graph_dkt_foldN.pt so
    # eval_folds.py picks them up unchanged.
    eval_src = (
        "# Rename ablation_<mode>_foldN.pt → graph_dkt_foldN.pt so eval_folds.py picks them up.\n"
        f"!for i in 0 1 2 3 4; do cp weights/ablation_{mode}_fold${{i}}.pt weights/graph_dkt_fold${{i}}.pt; done\n"
        "\n"
        "# Runs eval_folds.py to load fold0-N weights for DKT vs Graph-DKT,\n"
        "# evaluates them on their respective validation splits, and prints comparison table.\n"
        "# CPU evaluation is used by default because the models are tiny (~146K parameters).\n"
        "\n"
        "!python3 -m training.eval_folds --segment-by-length --device cpu --max-seq-len 2000 --folds 5\n"
    )
    nb["cells"][16]["source"] = eval_src

    # Cell 18 — packaging (creates /kaggle/working/results.zip)
    pkg_src = (
        "import zipfile, glob\n"
        "\n"
        "results = []\n"
        "\n"
        "# Package ablation_<mode>_foldN.pt weights (the new experimental output)\n"
        f"for f in glob.glob(\"weights/ablation_{mode}_fold*.pt\"):\n"
        "    results.append(f)\n"
        "    print(f\"Packed weight: {f}\")\n"
        "\n"
        "# Package pre-existing DKT fold weights (the canonical baseline)\n"
        "for f in glob.glob(\"weights/dkt_fold*.pt\"):\n"
        "    results.append(f)\n"
        "    print(f\"Packed weight: {f}\")\n"
        "\n"
        "# Actually write the zip\n"
        "with zipfile.ZipFile(\"/kaggle/working/results.zip\", \"w\") as z:\n"
        "    for f in results:\n"
        "        z.write(f)\n"
        "\n"
        "print(f\"\\nDone! Download /kaggle/working/results.zip from the Output panel of your Kaggle notebook.\")\n"
        "print(f\"Total files in zip: {len(results)}\")\n"
    )
    nb["cells"][18]["source"] = pkg_src

    out_path = os.path.join(OUT_DIR, fname)
    with open(out_path, "w") as f:
        json.dump(nb, f, indent=1)
    print(f"Wrote: {out_path}")


for v in VARIANTS:
    make_ablation_notebook(v["mode"], v["title"], v["runtime"], v["gpu"], v["fname"])

print("\nDone. Three ablation notebooks regenerated. DKT weights are now RESTORED, not retrained.")
print("Reminder: upload weights/dkt_fold{0,1,2,3,4}.pt to Kaggle as 'dkt-weights-5fold' before running.")
