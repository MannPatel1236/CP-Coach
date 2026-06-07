"""Tests for the canonical_only filter in dkt.collate_fn."""
from models.dkt import collate_fn
from data.topic_graph import CPTopicGraph


def test_collate_fn_canonical_only_drops_unknown_topics():
    """Unknown topics are dropped from the batch mask when canonical_only=True."""
    tg = CPTopicGraph()
    batch = [
        [
            {"topic": "math", "solved": 1, "difficulty": 0.5, "timestamp_delta": 0.0},
            {"topic": "unknown_topic", "solved": 0, "difficulty": 0.3, "timestamp_delta": 0.1},
        ],
        [
            {"topic": "greedy", "solved": 1, "difficulty": 0.4, "timestamp_delta": 0.2},
        ],
    ]

    out_default = collate_fn(batch, tg)
    out_canonical = collate_fn(batch, tg, canonical_only=True)

    # default keeps all rows
    assert out_default["mask"].sum().item() == 3
    # canonical_only drops unknown_topic
    assert out_canonical["mask"].sum().item() == 2


def test_collate_fn_default_keeps_unknown_topics_as_implementation():
    """Backward compat: unknown topics fall back to idx 0 (implementation)."""
    tg = CPTopicGraph()
    batch = [
        [{"topic": "unknown_topic", "solved": 0, "difficulty": 0.3, "timestamp_delta": 0.0}],
    ]
    out = collate_fn(batch, tg)
    # topic_id 0 = "implementation" (the silent fallback)
    assert out["topic_ids"].item() == 0
    assert out["mask"].sum().item() == 1
