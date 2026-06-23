#!/bin/bash
# Launch Graph-DKT 5-fold CV retrain (fixed architecture) on CPU
PATH="/usr/local/bin:/usr/local/sbin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export PATH
cd "/Users/mann/Desktop/CP Coach/backend" || exit 1
/usr/local/bin/python3 -m training.train_dkt \
  --data data/training.csv \
  --model graph_dkt \
  --epochs 50 \
  --batch 32 \
  --lr 0.001 \
  --seed 42 \
  --folds 5 \
  --out weights/graph_dkt.pt \
  --device cpu \
  > training_gdkt_fixed.log 2>&1
echo "EXIT CODE: $?" >> training_gdkt_fixed.log
