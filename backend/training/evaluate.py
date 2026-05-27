"""Model evaluation — AUC, accuracy, per-topic metrics."""

import logging
from collections import defaultdict

import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score, accuracy_score

from models.dkt import collate_fn

logger = logging.getLogger(__name__)


def evaluate_model(model, dataloader, topic_graph, device="cpu"):
    """Evaluate model on a dataloader. Returns {auc, accuracy, per_topic_auc, loss}."""
    model.eval()
    model.to(device)
    criterion = nn.BCELoss(reduction="none")

    all_preds = []
    all_labels = []
    per_topic_preds = defaultdict(list)
    per_topic_labels = defaultdict(list)

    with torch.no_grad():
        for batch_seqs in dataloader:
            batch = collate_fn(batch_seqs, topic_graph)
            batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

            predictions, _ = model(batch)  # (B, T, num_topics)
            mask = batch["mask"]           # (B, T)

            # Build target: for each timestep, target is solved (0/1) at the topic_id
            topic_ids = batch["topic_ids"]  # (B, T)
            solved = batch["solved"].squeeze(-1)  # (B, T)

            B, T, N = predictions.shape
            for b in range(B):
                for t in range(T):
                    if not mask[b, t]:
                        continue
                    tid = topic_ids[b, t].item()
                    pred_val = predictions[b, t, tid].item()
                    label_val = solved[b, t].item()

                    all_preds.append(pred_val)
                    all_labels.append(label_val)

                    topic_name = topic_graph.idx_to_topic[tid]
                    per_topic_preds[topic_name].append(pred_val)
                    per_topic_labels[topic_name].append(label_val)

    # Compute metrics
    result = {"auc": 0.0, "accuracy": 0.0, "per_topic_auc": {}, "loss": 0.0}

    # Vectorized loss computation to avoid per-iteration torch.tensor() overhead
    if all_preds:
        preds_tensor = torch.tensor(all_preds)
        labels_tensor = torch.tensor(all_labels, dtype=torch.float32)
        result["loss"] = criterion(preds_tensor, labels_tensor).mean().item()

    if len(set(all_labels)) > 1:
        result["auc"] = roc_auc_score(all_labels, all_preds)

    if all_labels:
        binary_preds = [1 if p >= 0.5 else 0 for p in all_preds]
        result["accuracy"] = accuracy_score(all_labels, binary_preds)

    for topic, preds in per_topic_preds.items():
        labels = per_topic_labels[topic]
        if len(set(labels)) > 1:
            result["per_topic_auc"][topic] = roc_auc_score(labels, preds)
        else:
            result["per_topic_auc"][topic] = 0.0

    return result


def compare_models(dkt_model, graph_dkt_model, dataloader, topic_graph, device="cpu"):
    """Compare DKT vs Graph-DKT. Returns comparison dict with improvement metrics."""
    dkt_res = evaluate_model(dkt_model, dataloader, topic_graph, device)
    gdkt_res = evaluate_model(graph_dkt_model, dataloader, topic_graph, device)

    topics_improved = [
        t for t in gdkt_res["per_topic_auc"]
        if gdkt_res["per_topic_auc"].get(t, 0) > dkt_res["per_topic_auc"].get(t, 0)
    ]

    result = {
        "dkt": {"auc": dkt_res["auc"], "accuracy": dkt_res["accuracy"], "per_topic_auc": dkt_res["per_topic_auc"]},
        "graph_dkt": {"auc": gdkt_res["auc"], "accuracy": gdkt_res["accuracy"], "per_topic_auc": gdkt_res["per_topic_auc"]},
        "improvement": {
            "auc_delta": gdkt_res["auc"] - dkt_res["auc"],
            "accuracy_delta": gdkt_res["accuracy"] - dkt_res["accuracy"],
            "topics_improved": topics_improved,
        },
    }

    # Print formatted comparison table
    print("\n" + "=" * 60)
    print(f"{'Metric':<25} {'DKT':>12} {'Graph-DKT':>12} {'Delta':>10}")
    print("=" * 60)
    print(f"{'AUC':<25} {dkt_res['auc']:>12.4f} {gdkt_res['auc']:>12.4f} {gdkt_res['auc'] - dkt_res['auc']:>+10.4f}")
    print(f"{'Accuracy':<25} {dkt_res['accuracy']:>12.4f} {gdkt_res['accuracy']:>12.4f} {gdkt_res['accuracy'] - dkt_res['accuracy']:>+10.4f}")
    print("-" * 60)
    print(f"Topics improved by Graph-DKT: {len(topics_improved)}/{len(gdkt_res['per_topic_auc'])}")
    if topics_improved:
        for t in topics_improved[:10]:
            d = dkt_res["per_topic_auc"].get(t, 0)
            g = gdkt_res["per_topic_auc"].get(t, 0)
            print(f"  {t:<25} {d:.4f} → {g:.4f} ({g - d:+.4f})")
    print("=" * 60 + "\n")

    return result
