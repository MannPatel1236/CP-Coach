"""Model evaluation — AUC, accuracy, per-topic metrics, ranking metrics."""
# pyright: reportPrivateImportUsage=false
#   torch.tensor / torch.cat / torch.float32 appear private to pyright but
#   are public PyTorch APIs exposed via the module's __getattr__.

import logging
import math
from collections import defaultdict

import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score, accuracy_score

from models.dkt import collate_fn

logger = logging.getLogger(__name__)

# Ranking metrics are computed at these K values.
RANKING_K_VALUES = [1, 3, 5, 10]


def get_target_prediction(predictions, topic_ids):
    """Extract the standard DKT target pairing: predictions[t, c_{t+1}].

    After observing input at timestep t, the model predicts the outcome for
    timestep t+1.  The target topic is NOT c_t (the topic just observed) but
    c_{t+1} (the topic of the NEXT interaction).  This is the standard DKT
    convention from Piech et al. (2015) — we must supervise what the model
    should actually predict, not what it has already seen.

    Both training (loss) and evaluation (AUC / per-topic AUC) must use this
    exact same pairing.  This shared function replaces two formerly-independent
    gather implementations that silently drifted apart.

    Args:
        predictions: (B, T, num_topics) — model output probabilities.
        topic_ids: (B, T) — ground-truth topic at each timestep.

    Returns:
        (B, T-1) tensor — predictions[b, t, topic_ids[b, t+1]] for t=0..T-2.
    """
    # predictions[:, :-1, :]  →  outputs at timesteps 0..T-2
    # topic_ids[:, 1:]        →  topics at timesteps 1..T-1 (c_{t+1})
    return predictions[:, :-1, :].gather(2, topic_ids[:, 1:].unsqueeze(-1)).squeeze(-1)


def _compute_ranking_metrics(predictions, topic_ids, mask, K_list=None):
    """Vectorized Precision@K and NDCG@K — no Python loops over B×T timesteps.

    Alignment: ranks all 29 topics by predictions[t], then checks the rank of
    the topic that actually appears at t+1 (c_{t+1} = topic_ids[t+1]).  This
    does NOT use the gather-in-at-t indexing that was fixed in the loss — the
    ranking has always been correct because it evaluates the full output vector,
    not a single extracted scalar per timestep.

    Uses a single argsort over the full (B, T, K) predictions tensor, then
    determines ranks via broadcast equality check — eliminating per-timestep
    Python loop overhead that caused MPS GPU→CPU sync stalls at scale.

    Args:
        predictions: (B, T, num_topics) — model output probabilities.
        topic_ids: (B, T) — ground-truth topic at each timestep.
        mask: (B, T) — boolean, valid positions.
        K_list: list of K values for ranking metrics (default RANKING_K_VALUES).

    Returns:
        dict with "precision_at_k" and "ndcg_at_k", each a dict of {K: value}.
    """
    if K_list is None:
        K_list = RANKING_K_VALUES

    B, T = topic_ids.shape
    if T <= 1:
        return {
            "precision_at_k": {k: 0.0 for k in K_list},
            "ndcg_at_k": {k: 0.0 for k in K_list},
        }

    # Single argsort over the full tensor: (B, T, num_topics)
    # sorted_indices[b, t, 0] = topic with highest predicted prob at timestep t
    sorted_indices = predictions.argsort(dim=-1, descending=True)

    # Temporal shift: we rank predictions[b, t-1] against topic_ids[b, t]
    source_sorted = sorted_indices[:, :-1, :]  # (B, T-1, num_topics)
    next_topics = topic_ids[:, 1:]  # (B, T-1)
    valid_mask = mask[:, 1:]  # (B, T-1)

    # Broadcast comparison: for each (b, t-1), at what position (rank) does
    # next_topics[b, t] appear in the sorted prediction at t-1?
    # match[b, t, rank] = True iff source_sorted[b, t, rank] == next_topics[b, t]
    match = (source_sorted == next_topics.unsqueeze(-1))  # (B, T-1, num_topics)

    # argmax gives the first True position = the rank (0-indexed)
    # For valid positions exactly one True exists; invalid positions return 0
    # (masked out below, so the 0 is harmless for invalid positions)
    ranks = match.to(torch.int64).argmax(dim=-1)  # (B, T-1), values 0..num_topics-1

    total = valid_mask.sum().item()
    result = {}
    if total > 0:
        valid = valid_mask.bool()
        rank_float = ranks.float()
        result["precision_at_k"] = {}
        result["ndcg_at_k"] = {}
        for k in K_list:
            hit = (ranks < k) & valid  # (B, T-1)
            n_hits = hit.sum().item()
            result["precision_at_k"][k] = n_hits / total

            # NDCG: 1/log2(rank+2) for each hit
            ndcg_contrib = torch.where(
                hit,
                1.0 / torch.log2(rank_float + 2.0),
                torch.tensor(0.0),
            )
            result["ndcg_at_k"][k] = ndcg_contrib.sum().item() / total
    else:
        result["precision_at_k"] = {k: 0.0 for k in K_list}
        result["ndcg_at_k"] = {k: 0.0 for k in K_list}

    return result


def evaluate_model(model, dataloader, topic_graph, device="cpu"):
    """Evaluate model on a dataloader.

    Returns:
        dict with keys:
            auc              — macro ROC-AUC
            accuracy         — binary accuracy (threshold 0.5)
            per_topic_auc    — dict {topic_name: AUC}
            loss             — mean BCELoss
            precision_at_k   — dict {K: hit-rate} for K in [1, 3, 5, 10]
            ndcg_at_k        — dict {K: NDCG} for K in [1, 3, 5, 10]
    """
    model.eval()
    model.to(device)
    criterion = nn.BCELoss(reduction="none")

    all_preds = []
    all_labels = []
    per_topic_preds = defaultdict(list)
    per_topic_labels = defaultdict(list)

    # Accumulate ranking metrics per batch (weighted by #valid timesteps)
    _rank_sum = {k: 0.0 for k in RANKING_K_VALUES}
    _ndcg_sum = {k: 0.0 for k in RANKING_K_VALUES}
    _rank_total = 0

    with torch.no_grad():
        for batch_seqs in dataloader:
            batch = collate_fn(batch_seqs, topic_graph)
            batch = {k: v.to(device) if isinstance(v, torch.Tensor) else v for k, v in batch.items()}

            predictions, _ = model(batch)  # (B, T, num_topics)

            # Move to CPU once — eliminates O(B×T) per-element .item() syncs
            predictions = predictions.cpu()
            topic_ids = batch["topic_ids"].cpu()  # (B, T)
            solved = batch["solved"].squeeze(-1).cpu()  # (B, T)
            batch_mask = batch["mask"].cpu()  # (B, T)

            # Standard DKT alignment: predictions[t] forecasts the outcome for
            # the topic practiced at timestep t+1 (c_{t+1}), not the topic just
            # observed at t (c_t).  The shared helper get_target_prediction()
            # enforces this pairing in both training and evaluation so they
            # cannot silently drift apart again.
            pred_target = get_target_prediction(predictions, topic_ids).contiguous()  # (B, T-1)
            solved_target = solved[:, 1:].contiguous()  # (B, T-1)
            topic_target = topic_ids[:, 1:].contiguous()  # (B, T-1)
            mask_target = batch_mask[:, 1:].contiguous()  # (B, T-1)

            valid_mask = mask_target.bool()
            flat_preds = pred_target[valid_mask]
            flat_labels = solved_target[valid_mask]
            flat_topic_ids = topic_target[valid_mask]

            # Single O(N) sync per tensor vs N separate .item() calls
            pred_list = flat_preds.tolist()
            label_list = flat_labels.tolist()
            tid_list = flat_topic_ids.tolist()

            all_preds.extend(pred_list)
            all_labels.extend(label_list)

            for pred, label, tid in zip(pred_list, label_list, tid_list):
                topic_name = topic_graph.idx_to_topic[tid]
                per_topic_preds[topic_name].append(pred)
                per_topic_labels[topic_name].append(label)

            # Compute ranking metrics per batch (already CPU tensors now)
            batch_rank = _compute_ranking_metrics(predictions, topic_ids, batch_mask)
            n_valid = valid_mask.sum().item()
            for k in RANKING_K_VALUES:
                _rank_sum[k] += batch_rank["precision_at_k"][k] * n_valid
                _ndcg_sum[k] += batch_rank["ndcg_at_k"][k] * n_valid
            _rank_total += n_valid

    # Compute metrics
    result = {
        "auc": 0.0,
        "accuracy": 0.0,
        "per_topic_auc": {},
        "loss": 0.0,
        "precision_at_k": {k: 0.0 for k in RANKING_K_VALUES},
        "ndcg_at_k": {k: 0.0 for k in RANKING_K_VALUES},
    }

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

    # Ranking metrics: weighted average across batches
    if _rank_total > 0:
        result["precision_at_k"] = {k: _rank_sum[k] / _rank_total for k in RANKING_K_VALUES}
        result["ndcg_at_k"] = {k: _ndcg_sum[k] / _rank_total for k in RANKING_K_VALUES}

    return result


def compute_rule_baseline_pk(sequences, topic_graph, K_list=None):
    """Compute P@K/NDCG@K for a frequency-based rule baseline.

    At each timestep t, ranks all topics by their cumulative frequency in the
    user's history up to timestep t (inclusive), then checks whether the actual
    topic at timestep t+1 is in the top-K. This is the simplest strawman: "the
    topics you've practiced most are what you'll practice next."

    This mirrors the DKT information boundary -- the model at timestep t has
    also seen input[t] (topic + solved + difficulty + delta) before predicting
    t+1.  For t=0 (first timestep), the single observed topic gets rank 1 and
    all others tie at count=0, broken by topic index.

    Args:
        sequences: list of per-user sequences (same format as DKTDataset input).
        topic_graph: CPTopicGraph instance.
        K_list: list of K values (default RANKING_K_VALUES).

    Returns:
        dict with 'precision_at_k' and 'ndcg_at_k', each a dict of {K: value}.
    """
    if K_list is None:
        K_list = RANKING_K_VALUES

    num_topics = topic_graph.num_topics
    topic_to_idx = topic_graph.topic_to_idx

    hits = {k: 0 for k in K_list}
    ndcg_sum = {k: 0.0 for k in K_list}
    total_valid = 0

    for seq in sequences:
        T = len(seq)
        if T <= 1:
            continue

        counts = [0] * num_topics

        for t in range(T - 1):
            # Add current topic t to cumulative counts (now known for predicting t+1)
            curr_topic = seq[t]["topic"]
            curr_idx = topic_to_idx.get(curr_topic)
            if curr_idx is None:
                continue
            counts[curr_idx] += 1

            # The actual next topic the user engaged with
            next_topic = seq[t + 1]["topic"]
            next_idx = topic_to_idx.get(next_topic)
            if next_idx is None:
                continue

            # Rank topics by frequency (desc), tie-break by topic index (asc).
            # O(num_topics log num_topics) per timestep, but with 29 topics and
            # ~5M rows this is negligible (~14k sort-calls * 29 items).
            ranked = sorted(range(num_topics), key=lambda i: (-counts[i], i))
            rank_pos = ranked.index(next_idx)

            for k in K_list:
                if rank_pos < k:
                    hits[k] += 1
                    ndcg_sum[k] += 1.0 / math.log2(rank_pos + 2.0)

            total_valid += 1

    result = {"precision_at_k": {}, "ndcg_at_k": {}}
    if total_valid > 0:
        for k in K_list:
            result["precision_at_k"][k] = hits[k] / total_valid
            result["ndcg_at_k"][k] = ndcg_sum[k] / total_valid
    else:
        for k in K_list:
            result["precision_at_k"][k] = 0.0
            result["ndcg_at_k"][k] = 0.0

    return result


def compare_models(dkt_model, graph_dkt_model, dataloader, topic_graph, device="cpu", sequences=None):
    """Compare DKT vs Graph-DKT. If sequences provided, also reports rule-based P@K/NDCG@K."""
    dkt_res = evaluate_model(dkt_model, dataloader, topic_graph, device)
    gdkt_res = evaluate_model(graph_dkt_model, dataloader, topic_graph, device)

    rule_res = None
    if sequences is not None:
        rule_res = compute_rule_baseline_pk(sequences, topic_graph)

    topics_improved = [
        t for t in gdkt_res["per_topic_auc"]
        if gdkt_res["per_topic_auc"].get(t, 0) > dkt_res["per_topic_auc"].get(t, 0)
    ]

    result = {
        "dkt": {
            "auc": dkt_res["auc"],
            "accuracy": dkt_res["accuracy"],
            "per_topic_auc": dkt_res["per_topic_auc"],
            "precision_at_k": dkt_res["precision_at_k"],
            "ndcg_at_k": dkt_res["ndcg_at_k"],
        },
        "graph_dkt": {
            "auc": gdkt_res["auc"],
            "accuracy": gdkt_res["accuracy"],
            "per_topic_auc": gdkt_res["per_topic_auc"],
            "precision_at_k": gdkt_res["precision_at_k"],
            "ndcg_at_k": gdkt_res["ndcg_at_k"],
        },
        "improvement": {
            "auc_delta": gdkt_res["auc"] - dkt_res["auc"],
            "accuracy_delta": gdkt_res["accuracy"] - dkt_res["accuracy"],
            "topics_improved": topics_improved,
        },
    }
    if rule_res is not None:
        result["rule"] = {
            "precision_at_k": rule_res["precision_at_k"],
            "ndcg_at_k": rule_res["ndcg_at_k"],
        }

    # Print formatted comparison table
    has_rule = rule_res is not None
    if has_rule:
        sep = "=" * 75
        print(f"\n{sep}")
        print(f"{'Metric':<25} {'DKT':>12} {'Graph-DKT':>12} {'Rule':>12} {'Δ(GD-DKT)':>10}")
        print(sep)
        print(f"{'AUC':<25} {dkt_res['auc']:>12.4f} {gdkt_res['auc']:>12.4f} {'—':>12} {gdkt_res['auc'] - dkt_res['auc']:>+10.4f}")
        print(f"{'Accuracy':<25} {dkt_res['accuracy']:>12.4f} {gdkt_res['accuracy']:>12.4f} {'—':>12} {gdkt_res['accuracy'] - dkt_res['accuracy']:>+10.4f}")
        print("-" * 75)
        for k in sorted(dkt_res["precision_at_k"]):
            dp = dkt_res["precision_at_k"][k]
            gp = gdkt_res["precision_at_k"][k]
            dn = dkt_res["ndcg_at_k"][k]
            gn = gdkt_res["ndcg_at_k"][k]
            rp = rule_res["precision_at_k"][k]
            rn = rule_res["ndcg_at_k"][k]
            print(f"P@{k:<21} {dp:>12.4f} {gp:>12.4f} {rp:>12.4f} {gp - dp:>+10.4f}")
            print(f"N@{k:<21} {dn:>12.4f} {gn:>12.4f} {rn:>12.4f} {gn - dn:>+10.4f}")
    else:
        print("\n" + "=" * 60)
        print(f"{'Metric':<25} {'DKT':>12} {'Graph-DKT':>12} {'Delta':>10}")
        print("=" * 60)
        print(f"{'AUC':<25} {dkt_res['auc']:>12.4f} {gdkt_res['auc']:>12.4f} {gdkt_res['auc'] - dkt_res['auc']:>+10.4f}")
        print(f"{'Accuracy':<25} {dkt_res['accuracy']:>12.4f} {gdkt_res['accuracy']:>12.4f} {gdkt_res['accuracy'] - dkt_res['accuracy']:>+10.4f}")
        print("-" * 60)
        for k in sorted(dkt_res["precision_at_k"]):
            dp = dkt_res["precision_at_k"][k]
            gp = gdkt_res["precision_at_k"][k]
            dn = dkt_res["ndcg_at_k"][k]
            gn = gdkt_res["ndcg_at_k"][k]
            print(f"P@{k:<21} {dp:>12.4f} {gp:>12.4f} {gp - dp:>+10.4f}")
            print(f"N@{k:<21} {dn:>12.4f} {gn:>12.4f} {gn - dn:>+10.4f}")

    print("-" * (75 if has_rule else 60))
    print(f"Topics improved by Graph-DKT: {len(topics_improved)}/{len(gdkt_res['per_topic_auc'])}")
    if topics_improved:
        for t in topics_improved[:10]:
            d = dkt_res["per_topic_auc"].get(t, 0)
            g = gdkt_res["per_topic_auc"].get(t, 0)
            print(f"  {t:<25} {d:.4f} → {g:.4f} ({g - d:+.4f})")
    print("=" * (75 if has_rule else 60) + "\n")

    return result
