"""Causality + interface tests for the SAKT-style and DKVMN-style models.

A model that fails causality (outputs at positions <= t change when inputs
at positions > t are perturbed) must not be trained.  Also asserts the
[B, L, num_topics] output contract so the EXISTING get_target_prediction()
helper and the EXISTING P@K pipeline run without a separate alignment path.
"""

import torch

from data.topic_graph import CPTopicGraph
from models.dkt import collate_fn
from models.dkvmn import DKVMNStyleModel
from models.sakt import SAKTStyleModel
from training.evaluate import _compute_ranking_metrics, get_target_prediction

TOPICS = CPTopicGraph.TOPICS


def _toy_batch():
    tg = CPTopicGraph()
    seqs = [
        [{"topic": TOPICS[i % len(TOPICS)], "solved": i % 2,
          "difficulty": 0.3 + 0.01 * i, "timestamp_delta": 1.0} for i in range(12)],
        [{"topic": TOPICS[(3 * i) % len(TOPICS)], "solved": (i + 1) % 2,
          "difficulty": 0.5, "timestamp_delta": 2.0} for i in range(9)],
    ]
    batch = collate_fn(seqs, tg)
    return tg, batch


def _check_model(make):
    tg, batch = _toy_batch()
    torch.manual_seed(0)
    model = make(tg.num_topics)
    model.eval()
    with torch.no_grad():
        preds, _ = model(batch)
    B, T = batch["topic_ids"].shape
    assert preds.shape == (B, T, tg.num_topics), preds.shape
    assert bool(((preds >= 0) & (preds <= 1)).all()), "outputs must be probabilities"

    # get_target_prediction() must work with no separate alignment path.
    tgt = get_target_prediction(preds, batch["topic_ids"])
    assert tgt.shape == (B, T - 1), tgt.shape
    # Ranking helper must accept the output tensor as-is.
    rank = _compute_ranking_metrics(preds, batch["topic_ids"], batch["mask"])
    assert set(rank["precision_at_k"]) == {1, 3, 5, 10}

    # Causality: perturb everything after t; outputs at <= t must not move.
    for t in (2, 6):
        pert = {k: (v.clone() if isinstance(v, torch.Tensor) else v)
                for k, v in batch.items()}
        pert["topic_ids"][:, t + 1:] = (pert["topic_ids"][:, t + 1:] + 7) % tg.num_topics
        pert["solved"][:, t + 1:] = 1.0 - pert["solved"][:, t + 1:]
        pert["difficulty"][:, t + 1:] = 0.99
        pert["ts_delta"][:, t + 1:] = 99.0
        with torch.no_grad():
            preds2, _ = model(pert)
        maxdiff = (preds[:, :t + 1, :] - preds2[:, :t + 1, :]).abs().max().item()
        assert maxdiff < 1e-6, f"causality violated at t={t}: maxdiff={maxdiff}"


def test_sakt_sdpa_causality_and_shape():
    _check_model(lambda n: SAKTStyleModel(num_topics=n, attn="sdpa"))


def test_sakt_naive_matches_sdpa_causality_and_shape():
    _check_model(lambda n: SAKTStyleModel(num_topics=n, attn="naive"))


def test_sakt_backends_agree():
    # Same weights, different backends: outputs must match closely
    # (sdpa may use a different but mathematically equivalent kernel).
    _, batch = _toy_batch()
    torch.manual_seed(1)
    m = SAKTStyleModel(num_topics=len(TOPICS), attn="sdpa")
    m.eval()
    with torch.no_grad():
        p_sdpa, _ = m(batch)
    m.set_attn("naive")
    with torch.no_grad():
        p_naive, _ = m(batch)
    assert (p_sdpa - p_naive).abs().max().item() < 1e-5


def test_dkvmn_causality_and_shape():
    _check_model(lambda n: DKVMNStyleModel(num_topics=n))
