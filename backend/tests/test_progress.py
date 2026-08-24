"""Greenhouse Phase 4c — /api/progress activity buckets (heatmap + streak data)."""

import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from main import app

from platforms.codeforces import _HANDLE_PATTERN

client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_cf_submissions(monkeypatch):
    """Two CF submissions in different weeks: one OK, one wrong, on distinct days."""
    async def mock_get_user_info(handle):
        if not _HANDLE_PATTERN.match(handle):
            from platforms.codeforces import HandleError
            raise HandleError(f"Invalid characters in handle: '{handle}'")
        return {"handle": "tourist", "rating": 1500, "rank": "specialist"}

    async def mock_get_submissions(handle, **kwargs):
        if not _HANDLE_PATTERN.match(handle):
            from platforms.codeforces import HandleError
            raise HandleError(f"Invalid characters in handle: '{handle}'")
        # Week A (Tue 2020-09-08): two submissions on two different days
        # (active_days=2, solved=1). Week B (+7 days): one (active_days=1, solved=0).
        # ISO weeks start Monday — Tue/Wed stay in one week, +7d lands in the next.
        base_a = 1_599_523_200
        return [
            {"problem": {"contestId": 1, "index": "A", "rating": 1500, "tags": ["implementation"]},
             "verdict": "OK", "creationTimeSeconds": base_a},
            {"problem": {"contestId": 1, "index": "B", "rating": 1500, "tags": ["math"]},
             "verdict": "WRONG_ANSWER", "creationTimeSeconds": base_a + 86400},
            {"problem": {"contestId": 1, "index": "C", "rating": 1500, "tags": ["greedy"]},
             "verdict": "WRONG_ANSWER", "creationTimeSeconds": base_a + 7 * 86400},
        ]

    from unittest.mock import AsyncMock
    mock = AsyncMock()
    mock.get_user_info = mock_get_user_info
    mock.get_submissions = mock_get_submissions
    mock.get_all_submissions = mock_get_submissions
    monkeypatch.setattr("routes.progress.CFClient", lambda: mock)
    return mock


class TestProgressActivity:
    def test_activity_buckets_computed_from_submission_weeks(self):
        r = client.get("/api/progress/tourist?platform=cf")
        assert r.status_code == 200, r.json()
        data = r.json()
        assert data["activity"], "activity buckets should be non-empty"
        weeks = list(data["activity"].keys())
        # The two real submission weeks stay first (zero-fill only appends later keys)
        a, b = data["activity"][weeks[0]], data["activity"][weeks[1]]
        # Week with the two same-week submissions: 2 active days, 1 solved of 2 total
        assert a["active_days"] == 2
        assert a["total"] == 2
        assert a["solved"] == 1
        # The other week: 1 active day, 0 solved of 1 total
        assert b["active_days"] == 1
        assert b["total"] == 1
        assert b["solved"] == 0

    def test_zero_fill_extends_to_current_week(self):
        """Trailing weeks are zero-filled through NOW so the latest bucket is the
        current week — an old active week must never count as the current streak.
        The fill is bounded to the heatmap window (+4w margin) so a GET never
        writes empty rows back to the user's first-ever submission."""
        r = client.get("/api/progress/tourist?platform=cf")
        activity = r.json()["activity"]
        weeks = list(activity.keys())
        # ISO week key helper mirroring routes.progress._iso_week_key
        def iso_key(dt):
            iso = dt.isocalendar()
            return f"{iso.year}-W{iso.week:02d}"
        current_key = iso_key(datetime.now(timezone.utc))
        assert weeks[-1] == current_key, f"latest bucket {weeks[-1]} != current week {current_key}"
        assert activity[current_key] == {"solved": 0, "total": 0, "active_days": 0}
        # No gaps in the trailing window: every ISO week label from 16w ago
        # through now is present.
        expected = set()
        cursor = datetime.now(timezone.utc) - timedelta(weeks=16)
        while cursor <= datetime.now(timezone.utc):
            expected.add(iso_key(cursor))
            cursor += timedelta(days=7)
        assert set(weeks) >= expected
        # The bound holds: zero-filled buckets can only come from the fill, and
        # at most ~17 of them exist (window + %W boundary rounding). Real
        # submission weeks all carry total >= 1.
        zero_weeks = [w for w, e in activity.items() if e["total"] == 0]
        assert len(zero_weeks) <= 17, f"zero-fill exceeded the 16w bound: {len(zero_weeks)} empty weeks"

    def test_week_keys_are_sorted_chronologically(self):
        r = client.get("/api/progress/tourist?platform=cf")
        weeks = list(r.json()["activity"].keys())
        assert weeks == sorted(weeks)

    def test_response_shape_has_activity_and_topic_progress(self):
        r = client.get("/api/progress/tourist?platform=cf")
        data = r.json()
        assert "activity" in data
        assert "topic_progress" in data
        # Every activity entry carries the three bucket fields
        for entry in data["activity"].values():
            assert set(entry.keys()) == {"solved", "total", "active_days"}


class TestProgressMalformedInputs:
    """Gate finding: ts<=0 / empty-submission branches had no coverage."""

    def test_empty_submission_list_yields_empty_activity(self, mock_cf_submissions):
        async def empty(handle, **kwargs):
            return []
        mock_cf_submissions.get_submissions = empty
        mock_cf_submissions.get_all_submissions = empty

        r = client.get("/api/progress/tourist?platform=cf")
        assert r.status_code == 200
        # No valid stamps → no buckets, no zero-fill (bounded fill needs a floor)
        assert r.json()["activity"] == {}

    def test_zero_timestamp_submissions_are_skipped(self, mock_cf_submissions):
        async def malformed(handle, **kwargs):
            return [
                {"problem": {"contestId": 1, "index": "A", "rating": 1500, "tags": ["math"]},
                 "verdict": "OK", "creationTimeSeconds": 0},
                {"problem": {"contestId": 1, "index": "B", "rating": 1500, "tags": ["math"]},
                 "verdict": "OK", "creationTimeSeconds": -42},
            ]
        mock_cf_submissions.get_submissions = malformed
        mock_cf_submissions.get_all_submissions = malformed

        r = client.get("/api/progress/tourist?platform=cf")
        assert r.status_code == 200
        # ts<=0 is skipped by the bucket loop AND the zero-fill stamp filter —
        # epoch-week phantom buckets must never appear.
        assert r.json()["activity"] == {}


@pytest.fixture(autouse=True)
def clear_progress_cache():
    """In-memory progress cache must not leak between tests."""
    from routes import progress as prog
    prog._progress_cache.clear()
    yield
    prog._progress_cache.clear()


class TestProgressCache:
    """Memory TTL tier in front of the CF fetch — second dashboard visit must
    not refetch ≤8000 submissions, and an expired entry must fall through."""

    @staticmethod
    def _counting(mock):
        """The autouse fixture wires plain functions — wrap for call counting."""
        from unittest.mock import AsyncMock
        mock.get_all_submissions = AsyncMock(side_effect=mock.get_all_submissions)
        return mock

    def test_second_call_hits_memory_cache_not_cf(self, mock_cf_submissions):
        self._counting(mock_cf_submissions)
        client.get("/api/progress/tourist?platform=cf")
        assert mock_cf_submissions.get_all_submissions.call_count == 1

        r = client.get("/api/progress/tourist?platform=cf")
        assert r.status_code == 200
        assert r.json()["activity"]
        # Served from cache — no second upstream fetch, no re-persist.
        assert mock_cf_submissions.get_all_submissions.call_count == 1

    def test_expired_entry_refetches(self, mock_cf_submissions):
        from routes import progress as prog
        self._counting(mock_cf_submissions)

        client.get("/api/progress/tourist?platform=cf")
        assert mock_cf_submissions.get_all_submissions.call_count == 1

        key = next(iter(prog._progress_cache))
        ts, activity, topic_progress = prog._progress_cache[key]
        prog._progress_cache[key] = (ts - (prog._PROGRESS_TTL + 1), activity, topic_progress)

        client.get("/api/progress/tourist?platform=cf")
        assert mock_cf_submissions.get_all_submissions.call_count == 2


class TestIsoWeekKeys:
    """Gate fix: %Y-W%W split one real week across New Year ('2025-W52' /
    '2026-W00' are the same Mon–Sun week). Keys must be ISO year-weeks."""

    def test_new_year_week_is_one_bucket_not_two(self, mock_cf_submissions):
        from datetime import datetime as dt_mod

        async def straddle(handle, **kwargs):
            mon = int(dt_mod(2025, 12, 29, tzinfo=timezone.utc).timestamp())
            sun = int(dt_mod(2026, 1, 4, tzinfo=timezone.utc).timestamp())
            return [
                {"problem": {"contestId": 1, "index": "A", "rating": 1500, "tags": ["math"]},
                 "verdict": "OK", "creationTimeSeconds": mon},
                {"problem": {"contestId": 1, "index": "B", "rating": 1500, "tags": ["math"]},
                 "verdict": "OK", "creationTimeSeconds": sun},
            ]

        mock_cf_submissions.get_submissions = straddle
        mock_cf_submissions.get_all_submissions = straddle

        r = client.get("/api/progress/tourist?platform=cf")
        activity = r.json()["activity"]
        # Mon Dec 29 2025 and Sun Jan 4 2026 share ISO week 2026-W01.
        assert set(activity.keys()) >= {"2026-W01"}
        assert activity["2026-W01"]["total"] == 2
        assert activity["2026-W01"]["active_days"] == 2
        # The %W split must never reappear.
        assert "2025-W52" not in activity
        assert "2026-W00" not in activity
