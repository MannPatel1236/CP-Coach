"""Parity test: scraper rows must match preprocessor sequence row-by-row.

Validates the refactor (Task 4) — the scraper delegates to the canonical
preprocessor, so output is provably equal to what the inference path uses.
"""
import pytest

from data.preprocessor import Preprocessor
from platforms.normalizer import Normalizer
from training.scrape_cf_data import _process


@pytest.fixture
def sample_raw_submissions():
    return [
        {
            "problem": {"contestId": 1234, "index": "A", "tags": ["math"], "rating": 1500},
            "verdict": "OK",
            "creationTimeSeconds": 1700000000,
        },
        {
            "problem": {"contestId": 1234, "index": "B",
                        "tags": ["dp", "weird_unknown_tag"], "rating": 1800},
            "verdict": "WRONG_ANSWER",
            "creationTimeSeconds": 1700001000,
        },
        {
            "problem": {"contestId": 1234, "index": "C", "tags": ["greedy"], "rating": 1200},
            "verdict": "OK",
            "creationTimeSeconds": 1700002000,
        },
    ]


def test_scraper_rows_match_preprocessor_sequence(sample_raw_submissions):
    """Each scraper row should match a preprocessor sequence step (modulo user_id)."""
    normalizer = Normalizer()
    preprocessor = Preprocessor()

    normalized = [n for n in (normalizer.normalize_cf_submission(s) for s in sample_raw_submissions) if n]
    expected_seq = preprocessor.build_submission_sequence(normalized, canonical_only=True)

    rows = _process(user_id=42, raw_submissions=sample_raw_submissions, min_solved=0)
    assert rows is not None

    assert len(rows) == len(expected_seq)

    for row, step in zip(rows, expected_seq):
        assert row["user_id"] == 42
        assert row["topic"] == step["topic"]
        assert row["solved"] == step["solved"]
        assert row["difficulty"] == step["difficulty"]
        assert row["timestamp_delta"] == step["timestamp_delta"]
        assert row["weight"] == step["weight"]


def test_scraper_drops_non_canonical_topics(sample_raw_submissions):
    """The scraper must never emit non-canonical topics in its output."""
    rows = _process(user_id=42, raw_submissions=sample_raw_submissions, min_solved=0)
    assert rows is not None
    for row in rows:
        assert row["topic"] in {"math", "dp", "greedy"}


def test_scraper_respects_min_solved():
    """A user with fewer than min_solved accepted problems is excluded."""
    few_subs = [
        {
            "problem": {"contestId": 1, "index": "A", "tags": ["math"], "rating": 800},
            "verdict": "OK",
            "creationTimeSeconds": 1700000000,
        },
    ]
    rows = _process(user_id=1, raw_submissions=few_subs, min_solved=5)
    assert rows is None


def test_scraper_csv_includes_weight_column(sample_raw_submissions):
    """All emitted rows must have a numeric weight in [0.2, 1.0] (recency range)."""
    rows = _process(user_id=42, raw_submissions=sample_raw_submissions, min_solved=0)
    assert rows is not None
    for row in rows:
        # Tolerate IEEE-754 noise — the recency formula gives exactly 0.2 at
        # the oldest timestep, but 1.0 - 0.8 may be 0.19999999999999996.
        assert row["weight"] >= 0.2 - 1e-9
        assert row["weight"] <= 1.0 + 1e-9


def test_scraper_difficulty_normalized_to_4000(sample_raw_submissions):
    """Difficulty must be normalized by /4000 (matches preprocessor)."""
    rows = _process(user_id=42, raw_submissions=sample_raw_submissions, min_solved=0)
    assert rows is not None
    # 1500 / 4000 = 0.375; 1200 / 4000 = 0.30; 1800 / 4000 = 0.45
    difficulties = sorted(r["difficulty"] for r in rows)
    assert 0.30 in difficulties
    assert 0.45 in difficulties
