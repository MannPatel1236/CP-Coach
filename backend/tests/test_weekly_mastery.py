"""Weekly fused-mastery bucketing — pure helper, no torch required."""

from datetime import datetime, timezone

from data.preprocessor import build_weekly_mastery

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)  # Thursday of ISO 2026-W40
TOPICS = ["implementation", "dp"]


def _entry(ts_ms):
    return {"topic": "implementation", "timestamp": ts_ms}


def _ms(dt):
    return int(dt.timestamp() * 1000)


def test_last_value_per_week_wins():
    seq = [
        _entry(_ms(datetime(2026, 9, 28, 10, tzinfo=timezone.utc))),  # W40 Mon
        _entry(_ms(datetime(2026, 9, 30, 10, tzinfo=timezone.utc))),  # W40 Wed
    ]
    out = build_weekly_mastery(seq, [[0.1, 0.2], [0.7, 0.8]], TOPICS, now=NOW)
    s = out["implementation"]
    assert len(s) == 12
    assert s[10] is None                       # W39: nothing observed yet
    assert s[11] == {"week": "2026-W40", "p": 0.7}


def test_pre_window_value_seeds_the_whole_window():
    seq = [_entry(_ms(datetime(2026, 6, 1, tzinfo=timezone.utc)))]  # before W29
    out = build_weekly_mastery(seq, [[0.3, 0.9]], TOPICS, now=NOW)
    s = out["implementation"]
    assert s[0] is not None
    assert s[0]["week"] == "2026-W29"
    assert all(pt is not None and pt["p"] == 0.3 for pt in s)


def test_sunday_before_window_start_seeds_it():
    seq = [_entry(_ms(datetime(2026, 7, 12, 10, tzinfo=timezone.utc)))]  # W28 Sunday
    out = build_weekly_mastery(seq, [[0.3, 0.9]], TOPICS, now=NOW)
    first = out["implementation"][0]
    assert first is not None
    assert first["week"] == "2026-W29"
    assert first["p"] == 0.3


def test_leading_weeks_null_until_first_estimate():
    seq = [
        _entry(_ms(datetime(2026, 9, 14, tzinfo=timezone.utc))),  # W38
        _entry(_ms(datetime(2026, 9, 21, tzinfo=timezone.utc))),  # W39
    ]
    out = build_weekly_mastery(seq, [[0.2, 0.5], [0.6, 0.5]], TOPICS, now=NOW)
    s = out["implementation"]
    assert s[7] is None and s[8] is None      # W36, W37 — nothing before first obs
    assert s[9] is not None and s[9]["p"] == 0.2    # W38
    assert s[10] is not None and s[10]["p"] == 0.6  # W39
    assert s[11] is not None and s[11]["p"] == 0.6  # W40 carried forward


def test_week_labels_roll_over_iso_year():
    now = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
    seq = [_entry(_ms(datetime(2025, 10, 13, 10, tzinfo=timezone.utc)))]  # W42 Monday
    out = build_weekly_mastery(seq, [[0.5, 0.5]], TOPICS, now=now)
    s = out["implementation"]
    assert s[0] is not None and s[0]["week"] == "2025-W42"
    assert s[11] is not None and s[11]["week"] == "2026-W01"


def test_entries_without_timestamp_are_ignored():
    seq = [_entry(0), _entry(_ms(datetime(2026, 9, 28, tzinfo=timezone.utc)))]
    out = build_weekly_mastery(seq, [[0.99, 0.99], [0.4, 0.4]], TOPICS, now=NOW)
    last = out["implementation"][11]
    assert last is not None
    assert last["p"] == 0.4


def test_window_keeps_only_last_12_weeks():
    seq = [_entry(_ms(datetime(2026, 1, 5, tzinfo=timezone.utc)))]  # far before window
    out = build_weekly_mastery(seq, [[0.3, 0.3]], TOPICS, now=NOW)
    s = out["implementation"]
    assert len(s) == 12
    assert s[0] is not None and s[0]["week"] == "2026-W29"
    assert s[11] is not None and s[11]["week"] == "2026-W40"


def test_empty_sequence_returns_empty_mapping():
    assert build_weekly_mastery([], [], TOPICS, now=NOW) == {}
