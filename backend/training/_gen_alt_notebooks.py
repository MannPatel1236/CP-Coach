"""Generate Kaggle notebooks for the alternative-architecture + no-difficulty runs.

Jobs (all 2k config ONLY, never 10k):
  sakt       --model sakt --attn sdpa, 5 folds x 50 epochs, batch 16, cuda
  dkvmn      --model dkvmn, 5 folds x 50 epochs, batch 16, cuda
  nodiff-dkt --model dkt --no-difficulty, 5 folds x 50 epochs, batch 16, cuda

Base: backend/training/kaggle_ablation_no_graph.ipynb (restore-cell pattern).

The new code is UNCOMMITTED locally and must NOT be pushed, so each notebook
overlays it from a Kaggle input dataset: upload backend/kaggle_alt_code.zip
(built by _pack_alt_code.py lines below — same script, --pack) as a private
dataset named `cpcoach-alt-code`, then Add Data in each notebook.  The overlay
cell copies the files over the fresh clone and asserts the imports.

Also needed per notebook (one-time): training.csv dataset (as before) and
`dkt-weights-5fold` (as before).

Usage:
  python3 training/_gen_alt_notebooks.py --pack   # builds kaggle_alt_code.zip + notebooks
  python3 training/_gen_alt_notebooks.py          # notebooks only
"""

import json
import os
import sys
import zipfile

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(BACKEND, "training", "kaggle_ablation_no_graph.ipynb")
OUT_DIR = os.path.join(BACKEND, "training")

OVERLAY_FILES = [
    "models/sakt.py",
    "models/dkvmn.py",
    "models/dkt.py",
    "training/train_dkt.py",
    "training/eval_folds.py",
    "training/evaluate.py",
    "training/paired_stats.py",
    "training/benchmark_efficiency.py",
    "tests/test_alt_causality.py",
]

JOBS = [
    {
        "key": "sakt",
        "title": "Kaggle Notebook: SAKT-style (topic-level adaptation), 2k, 5 folds x 50 epochs",
        "runtime": "~2-3 hours on T4 x1",
        "gpu": "GPU T4 x1",
        "fname": "kaggle_alt_sakt.ipynb",
        "train_cmd": ("!python3 -m training.train_dkt \\\n"
                      "  --data data/training.csv --model sakt --attn sdpa \\\n"
                      "  --epochs 50 --folds 5 --out weights/sakt.pt \\\n"
                      "  --batch 16 --device cuda --max-seq-len 2000 --seed 42\n"),
        "smoke_cmd": ("!python3 -m training.train_dkt \\\n"
                      "  --data data/training.csv --model sakt --attn sdpa \\\n"
                      "  --epochs 3 --folds 1 --out weights/smoke_sakt.pt \\\n"
                      "  --batch 16 --device cuda --max-seq-len 2000 --seed 42\n"),
        "new_prefix": "sakt",
        "model_type": "sakt",
        "extra_note": "",
    },
    {
        "key": "dkvmn",
        "title": "Kaggle Notebook: DKVMN-style (topic-level adaptation), 2k, 5 folds x 50 epochs",
        "runtime": "~4-8 hours on T4 x1 (see epoch-cap rule below)",
        "gpu": "GPU T4 x1",
        "fname": "kaggle_alt_dkvmn.ipynb",
        "train_cmd": ("!python3 -m training.train_dkt \\\n"
                      "  --data data/training.csv --model dkvmn \\\n"
                      "  --epochs 50 --folds 5 --out weights/dkvmn.pt \\\n"
                      "  --batch 16 --device cuda --max-seq-len 2000 --seed 42\n"),
        "smoke_cmd": ("!python3 -m training.train_dkt \\\n"
                      "  --data data/training.csv --model dkvmn \\\n"
                      "  --epochs 3 --folds 1 --out weights/smoke_dkvmn.pt \\\n"
                      "  --batch 16 --device cuda --max-seq-len 2000 --seed 42\n"),
        "new_prefix": "dkvmn",
        "model_type": "dkvmn",
        "extra_note": (
            "\n**EPOCH-CAP RULE (DKVMN only):** the per-step Python loop makes "
            "DKVMN slower than DKT. After the smoke cell, read s/epoch, project "
            "5 folds x 50 epochs; if the projection exceeds ~8 GPU-h, lower "
            "--epochs in the train cell (e.g. 25) AND record the cap — the paper "
            "states the cap identically for this model only."
        ),
    },
    {
        "key": "nodiff-dkt",
        "title": "Kaggle Notebook: DKT difficulty-blinded (--no-difficulty), 2k, 5 folds x 50 epochs",
        "runtime": "~1-1.5 hours on T4 x1",
        "gpu": "GPU T4 x1",
        "fname": "kaggle_nodiff_dkt.ipynb",
        "train_cmd": ("!python3 -m training.train_dkt \\\n"
                      "  --data data/training.csv --model dkt --no-difficulty \\\n"
                      "  --epochs 50 --folds 5 --out weights/dkt_nodiff.pt \\\n"
                      "  --batch 16 --device cuda --max-seq-len 2000 --seed 42\n"),
        "smoke_cmd": ("!python3 -m training.train_dkt \\\n"
                      "  --data data/training.csv --model dkt --no-difficulty \\\n"
                      "  --epochs 3 --folds 1 --out weights/smoke_nodiff.pt \\\n"
                      "  --batch 16 --device cuda --max-seq-len 2000 --seed 42\n"),
        "new_prefix": "dkt_nodiff",
        "model_type": "dkt",
        "extra_note": "",
    },
]

OVERLAY_CELL = """# NEW CODE OVERLAY (local changes are NOT pushed to GitHub).
# Dataset: private `cpcoach-alt-code` (backend/kaggle_alt_code.zip contents).
import glob, shutil
found = False
for d in glob.glob('/kaggle/input/cpcoach-alt-code*'):
    for root, _, files in __import__('os').walk(d):
        for fn in files:
            if fn.endswith('.py'):
                src = __import__('os').path.join(root, fn)
                rel = __import__('os').path.relpath(src, d)
                dst = __import__('os').path.join('/kaggle/working/CP-Coach/backend', rel)
                __import__('os').makedirs(__import__('os').path.dirname(dst), exist_ok=True)
                shutil.copy(src, dst)
                print(f'Overlaid: {rel}')
                found = True
if not found:
    raise FileNotFoundError("Overlay dataset `cpcoach-alt-code` not found in /kaggle/input/.")
import sys; sys.path.insert(0, '/kaggle/working/CP-Coach/backend')
""" + """
# Verify the new code is importable with the new flags.
from models.sakt import SAKTStyleModel
from models.dkvmn import DKVMNStyleModel
import training.train_dkt as T
assert '--model' in open('training/train_dkt.py').read() and "'sakt'" in open('training/train_dkt.py').read()
print('overlay OK: sakt/dkvmn importable, train_dkt has new models')
"""


def make_notebook(job):
    with open(TEMPLATE) as f:
        nb = json.load(f)

    nb["cells"][0]["source"] = (
        "# ============================================================\n"
        f"# {job['title']}\n"
        "# ============================================================\n"
        "# RUN IN ORDER. 2k config ONLY (max-seq-len 2000), never 10k.\n"
        f"# Expected runtime: {job['runtime']}\n"
        f"# Accelerator recommendation: {job['gpu']}\n"
        "#\n"
        "# One-time setup per notebook: Add Data -> training.csv dataset,\n"
        "# `dkt-weights-5fold` dataset, AND `cpcoach-alt-code` dataset\n"
        "# (built locally by: python3 training/_gen_alt_notebooks.py --pack).\n"
        "# ============================================================"
    )

    # Insert overlay cell right after the clone cell (cell 6), as new cell 7.
    overlay = {"cell_type": "code", "metadata": {}, "source": OVERLAY_CELL,
               "outputs": [], "execution_count": None}
    nb["cells"].insert(7, overlay)

    # Smoke cell (was cell 10, now shifted by the insert).
    for c in nb["cells"]:
        s = "".join(c["source"]) if isinstance(c["source"], list) else c["source"]
        if "ablation_smoke_" in s and "train_dkt" in s:
            c["source"] = ("%cd /kaggle/working/CP-Coach/backend\n" + job["smoke_cmd"]
                           + ("\n# Smoke must show: loss decreasing, s/epoch, val AUC. "
                              "For dkvmn, project 5 folds x 50 epochs from s/epoch here.\n"
                              if job["key"] == "dkvmn" else ""))
        if c["cell_type"] == "markdown" and "Smoke test" in s:
            c["source"] = f"### Smoke test for {job['key']} (3 epochs, 1 fold){job['extra_note']}"
        if "ablation_no_graph.pt" in s and "--epochs 50" in s:
            c["source"] = ("# Full train. Run in foreground so Save & Run All blocks.\n"
                           f"# Expected runtime: {job['runtime']}.\n\n" + job["train_cmd"])
        if "CELL 6" in s and "retrain" in s:
            c["source"] = f"### Full train: {job['key']} (5 folds x 50 epochs){job['extra_note']}"
        if "ablation_no_graph_fold${i}" in s and "graph_dkt_fold${i}" in s:
            c["source"] = (
                f"# Stage {job['new_prefix']}_foldN.pt -> graph_dkt_foldN.pt for eval_folds.py.\n"
                f"!for i in 0 1 2 3 4; do cp weights/{job['new_prefix']}_fold${{i}}.pt "
                "weights/graph_dkt_fold${i}.pt; done\n"
                "\n# Evaluate (GPU box has no spare CPU issue; device cuda is fine).\n"
                f"!python3 -m training.eval_folds --device cuda --max-seq-len 2000 --folds 5 "
                f"--model-type {job['model_type']} "
                f"--sidecar results/eval_{job['key']}_2k_perfolds.sidecar.json "
                f"--per-user-npz results/eval_{job['key']}_2k_perfolds.peruser.npz "
                f"| tee results/eval_{job['key']}_2k_perfolds.txt\n"
            )
        if "results.zip" in s and "ZipFile" in s:
            extra = ",\n            'results/efficiency_benchmark.txt'" if job["key"] == "sakt" else ""
            c["source"] = (
                "import zipfile, glob\n\nresults = []\n"
                f"for pat in ['weights/{job['new_prefix']}_fold*.pt',\n"
                f"            'results/eval_{job['key']}_2k_perfolds.*'{extra}]:\n"
                "    for f in glob.glob(pat):\n"
                "        results.append(f)\n"
                "        print(f'Packed: {f}')\n"
                "with zipfile.ZipFile('/kaggle/working/results.zip', 'w') as z:\n"
                "    for f in results:\n"
                "        z.write(f)\n"
                "print('\\nDone! Download /kaggle/working/results.zip from the Output panel.')\n"
            )
    if job["key"] == "sakt":
        # Efficiency benchmark cell (all 5 models, same GPU; fresh instances).
        nb["cells"].append({"cell_type": "markdown", "metadata": {},
                            "source": "### Efficiency benchmark (all models, same GPU)"})
        nb["cells"].append({"cell_type": "code", "metadata": {},
                            "source": ("%cd /kaggle/working/CP-Coach/backend\n"
                                       "!python3 -m training.benchmark_efficiency "
                                       "--out results/efficiency_benchmark.txt\n"),
                            "outputs": [], "execution_count": None})

    out_path = os.path.join(OUT_DIR, job["fname"])
    with open(out_path, "w") as f:
        json.dump(nb, f, indent=1)
    print(f"Wrote: {out_path}")


def pack_overlay():
    zip_path = os.path.join(BACKEND, "kaggle_alt_code.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in OVERLAY_FILES:
            z.write(os.path.join(BACKEND, rel), rel)
    print(f"Packed: {zip_path} ({len(OVERLAY_FILES)} files)")


if __name__ == "__main__":
    do_pack = "--pack" in sys.argv[1:]
    if do_pack:
        pack_overlay()
    for job in JOBS:
        make_notebook(job)
    print("\nDone. Upload backend/kaggle_alt_code.zip as private dataset `cpcoach-alt-code`.")
