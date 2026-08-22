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
        # %W weeks start Monday — Tue/Wed stay in one week, +7d lands in the next.
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
        current week — an old active week must never count as the current streak."""
        r = client.get("/api/progress/tourist?platform=cf")
        weeks = list(r.json()["activity"].keys())
        current_key = datetime.now(timezone.utc).strftime("%Y-W%W")
        assert weeks[-1] == current_key, f"latest bucket {weeks[-1]} != current week {current_key}"
        assert r.json()["activity"][current_key] == {"solved": 0, "total": 0, "active_days": 0}
        # No gaps: every Monday-based %W label between first and last is present.
        expected = set()
        cursor = datetime(2020, 9, 8, tzinfo=timezone.utc)
        while cursor <= datetime.now(timezone.utc):
            expected.add(cursor.strftime("%Y-W%W"))
            cursor += timedelta(days=7)
        assert set(weeks) == expected

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