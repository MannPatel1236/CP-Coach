"""Tests for the canonical_only filter in build_submission_sequence."""
from data.preprocessor import Preprocessor


def test_build_submission_sequence_canonical_only_drops_non_canonical():
    """Non-canonical topics are dropped when canonical_only=True."""
    p = Preprocessor()
    submissions = [
        {
            "problem_id": "cf-1234A",
            "platform": "cf",
            "verdict": "OK",
            "topics": ["math", "weird_unknown_tag"],
            "difficulty": 1500,
            "timestamp": 1700000000000,
        },
        {
            "problem_id": "cf-1234B",
            "platform": "cf",
            "verdict": "OK",
            "topics": ["greedy"],
            "difficulty": 1800,
            "timestamp": 1700001000000,
        },
    ]
    seq_default = p.build_submission_sequence(submissions)
    seq_canonical = p.build_submission_sequence(submissions, canonical_only=True)

    # default keeps all topics
    default_topics = [s["topic"] for s in seq_default]
    assert "math" in default_topics
    assert "greedy" in default_topics
    assert "weird_unknown_tag" in default_topics

    # canonical_only drops non-canonical
    canonical_topics = [s["topic"] for s in seq_canonical]
    assert "math" in canonical_topics
    assert "greedy" in canonical_topics
    assert "weird_unknown_tag" not in canonical_topics


def test_build_submission_sequence_default_keeps_all_topics():
    """canonical_only defaults to False — existing behavior preserved."""
    p = Preprocessor()
    submissions = [
        {
            "problem_id": "cf-1A",
            "platform": "cf",
            "verdict": "OK",
            "topics": ["math", "unknown_thing"],
            "difficulty": 1500,
            "timestamp": 1700000000000,
        },
    ]
    seq = p.build_submission_sequence(submissions)
    topics = [s["topic"] for s in seq]
    assert "math" in topics
    assert "unknown_thing" in topics