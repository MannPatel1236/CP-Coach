"""Verify recency weight formula matches frontend api.js implementation exactly."""

from data.preprocessor import _recency_weight, Preprocessor


def _make_subs(n, verdict="OK"):
    """Generate n fake submissions newest-first (like CF API returns)."""
    return [
        {
            "problem_id": f"cf-{i}A",
            "platform": "cf",
            "verdict": verdict,
            "topics": ["math"],
            "difficulty": 1200,
            "timestamp": (n - i) * 1000,  # newest first = highest timestamp first
        }
        for i in range(n)
    ]


def test_recency_weight_formula():
    """weight = 1.0 - (0.8 * idx) / max(total-1, 1). idx=0 is most recent."""
    # 5 submissions: idx=0 (newest) → 1.0, idx=4 (oldest) → 0.2
    assert abs(_recency_weight(0, 5) - 1.0) < 0.01
    assert abs(_recency_weight(1, 5) - 0.8) < 0.01
    assert abs(_recency_weight(2, 5) - 0.6) < 0.01
    assert abs(_recency_weight(3, 5) - 0.4) < 0.01
    assert abs(_recency_weight(4, 5) - 0.2) < 0.01


def test_single_submission_weight_is_1():
    """A single submission gets weight=1.0."""
    p = Preprocessor()
    profile = p.build_topic_profile(_make_subs(1))
    assert len(profile) == 1
    assert abs(profile[0]["recency_weight"] - 1.0) < 0.01


def test_two_submissions_weights():
    """Two subs: most recent=1.0, oldest=0.2. Avg=0.6."""
    p = Preprocessor()
    profile = p.build_topic_profile(_make_subs(2))
    assert len(profile) == 1
    # Both are OK and in "math", so recency_weight = avg(1.0, 0.2) = 0.6
    assert abs(profile[0]["recency_weight"] - 0.6) < 0.01


def test_recency_formula_matches_frontend():
    """
    Frontend formula: weight = 1.0 - (0.8 * idx) / max(total-1, 1)
    idx=0 most recent. Verify backend produces same weights for n=5.

    Frontend: submissions arrive newest-first (idx=0 = most recent).
    Backend build_submission_sequence sorts oldest-first, then uses
    rev_idx = total - 1 - i to compute the same weighting.

    The sequence output goes oldest→newest, so weights go 0.2→1.0.
    """
    n = 5
    expected_weights = [1.0 - (0.8 * i) / (n - 1) for i in range(n)]
    p = Preprocessor()
    seq = p.build_submission_sequence(_make_subs(n))
    actual_weights = [step["weight"] for step in seq]
    # Sequence is oldest-first after sort, so weights go 0.2 → 1.0
    assert len(actual_weights) == n
    for actual, expected in zip(actual_weights, reversed(expected_weights)):
        assert abs(actual - expected) < 0.01, f"Weight mismatch: {actual} vs {expected}"


def test_zero_division_guard():
    """build_topic_profile handles empty list without crashing."""
    p = Preprocessor()
    profile = p.build_topic_profile([])
    assert profile == []

    seq = p.build_submission_sequence([])
    assert seq == []