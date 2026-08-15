"""Greenhouse Phase 4a — /api/rating-trajectory tests (shape, LC, cache, errors)."""

import pytest
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from main import app

from platforms.codeforces import _HANDLE_PATTERN

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_mem_cache():
    """In-memory trajectory cache must not leak between tests."""
    from routes import trajectory as traj
    traj._cache.clear()
    yield
    traj._cache.clear()


@pytest.fixture(autouse=True)
def mock_cf_rating_history(monkeypatch):
    """Stub CFClient in routes.trajectory so tests never hit the real CF API."""
    async def mock_get_rating_history(handle):
        if not _HANDLE_PATTERN.match(handle):
            from platforms.codeforces import HandleError
            raise HandleError(f"Invalid characters in handle: '{handle}'")
        return [
            {"contestId": 1000, "contestName": "Round 1", "rank": 500,
             "ratingUpdateTimeSeconds": 1600000000, "oldRating": 1400, "newRating": 1500},
            {"contestId": 1001, "contestName": "Round 2", "rank": 300,
             "ratingUpdateTimeSeconds": 1601000000, "oldRating": 1500, "newRating": 1600},
        ]

    mock = AsyncMock()
    mock.get_rating_history = AsyncMock(side_effect=mock_get_rating_history)
    monkeypatch.setattr("routes.trajectory.CFClient", lambda: mock)
    return mock


class TestRatingTrajectory:
    def test_cf_returns_points_shape(self):
        r = client.get("/api/rating-trajectory/tourist?platform=cf")
        assert r.status_code == 200, r.json()
        data = r.json()
        assert data["handle"] == "tourist"
        assert data["platform"] == "cf"
        assert len(data["points"]) == 2
        point = data["points"][0]
        assert point["contest_id"] == 1000
        assert point["contest_name"] == "Round 1"
        assert point["new_rating"] == 1500
        assert point["timestamp"] == 1600000000

    def test_lc_returns_null_points_never_404(self):
        r = client.get("/api/rating-trajectory/someone?platform=lc")
        assert r.status_code == 200
        data = r.json()
        assert data["platform"] == "lc"
        assert data["points"] is None

    def test_invalid_handle_returns_400(self):
        r = client.get("/api/rating-trajectory/invalid handle")
        assert r.status_code == 400

    def test_second_call_hits_cache_not_cf(self, mock_cf_rating_history):
        r1 = client.get("/api/rating-trajectory/tourist?platform=cf")
        assert r1.status_code == 200
        r2 = client.get("/api/rating-trajectory/tourist?platform=cf")
        assert r2.status_code == 200
        assert r2.json() == r1.json()
        # TTL cache: exactly one live CF fetch across both calls
        assert mock_cf_rating_history.get_rating_history.call_count == 1

    def test_cf_api_failure_returns_502(self, mock_cf_rating_history):
        async def boom(handle):
            raise RuntimeError("CF API unavailable")
        mock_cf_rating_history.get_rating_history = boom
        r = client.get("/api/rating-trajectory/tourist?platform=cf")
        assert r.status_code == 502