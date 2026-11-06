"""New-submission-pair ranking metrics — the honest P@K pair set.

Pooled P@K counts ~69% same-submission tag-row pairs where the target is an
input just seen (the copy leak). These tests pin the extra_pair_mask variant
of _compute_ranking_metrics and the new_sub_only rule baseline that exclude
those pairs, mirroring evaluate_model's auc_new pair set.
"""

import torch

from data.topic_graph import CPTopicGraph
from training.evaluate import _compute_ranking_metrics, compute_rule_baseline_pk


def test_extra_pair_mask_restricts_ranking_to_new_pairs():
    topic_graph = CPTopicGraph()
    n = topic_graph.num_topics
    topic_ids = torch.tensor([[5, 9, 13]])
    mask = torch.ones(1, 3, dtype=torch.bool)
    preds = torch.full((1, 3, n), 0.5)
    preds[0, 0, 9] = 0.9   # t=0 ranks topic 9 first  → pair 0→1 is a P@1 hit
    preds[0, 1, 13] = 0.1  # t=1 ranks topic 13 last  → pair 1→2 is a P@1 miss

    pooled = _compute_ranking_metrics(preds, topic_ids, mask)
    assert pooled["precision_at_k"][1] == 0.5  # one hit, one miss

    new_only = _compute_ranking_metrics(
        preds, topic_ids, mask, extra_pair_mask=torch.tensor([[False, True]])
    )
    # Only pair 1→2 counted (the miss) — the excluded pair was the hit.
    assert new_only["precision_at_k"][1] == 0.0
    assert new_only["ndcg_at_k"][1] == 0.0
    assert new_only["precision_at_k"][10] == 0.0  # pair 1→2 target ranks last


def test_rule_baseline_new_sub_only_excludes_same_submission_pairs():
    topic_graph = CPTopicGraph()
    # Three tag-rows: rows 0-1 are one submission (weight 1.0), row 2 a new
    # submission (weight 0.5). Pair 0→1 is the copy leak — its "next topic" is
    # the next sibling tag of the submission just seen.
    seq = [
        {"topic": "dp", "weight": 1.0},
        {"topic": "dp", "weight": 1.0},
        {"topic": "math", "weight": 0.5},
    ]
    pooled = compute_rule_baseline_pk([seq], topic_graph)
    assert pooled["precision_at_k"][1] == 0.5   # leak pair hits, honest pair misses
    assert pooled["precision_at_k"][3] == 1.0

    new_only = compute_rule_baseline_pk([seq], topic_graph, new_sub_only=True)
    assert new_only["precision_at_k"][1] == 0.0  # leak pair excluded
    assert new_only["precision_at_k"][3] == 1.0  # math still ranks within top-3
