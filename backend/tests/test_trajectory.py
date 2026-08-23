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


_PAYLOAD = [{"contest_id": 1, "contest_name": "R", "rank": 10,
             "old_rating": 1400, "new_rating": 1500, "timestamp": 1600000000}]


class _FakeScalars:
    def __init__(self, row):
        self._row = row

    def first(self):
        return self._row


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def scalars(self):
        return _FakeScalars(self._row)


class _FakeSession:
    """Serves one pre-built RatingTrajectory-like row; records writes."""

    def __init__(self, row):
        self.row = row
        self.captured_stmts = []
        self.added = []

    async def execute(self, stmt):
        self.captured_stmts.append(stmt)
        return _FakeResult(self.row)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for i, obj in enumerate(self.added):
            if getattr(obj, "id", None) is None:
                obj.id = 50 + i

    async def commit(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class TestPgCacheTier:
    """Second-tier Postgres cache: TTL expiry + lookup semantics."""

    def _install(self, monkeypatch, row):
        sessions = []

        def factory():
            s = _FakeSession(row)
            sessions.append(s)
            return s
        monkeypatch.setattr("routes.trajectory.AsyncSessionLocal", factory)
        return sessions

    def test_fresh_row_served_without_live_cf_call(self, monkeypatch, mock_cf_rating_history):
        from datetime import timedelta
        from db.connection import utcnow_naive
        row = type("Row", (), {"payload": _PAYLOAD,
                               "fetched_at": utcnow_naive() - timedelta(minutes=5)})()
        self._install(monkeypatch, row)

        r = client.get("/api/rating-trajectory/tourist?platform=cf")
        assert r.status_code == 200, r.json()
        assert r.json()["points"][0]["new_rating"] == 1500
        assert mock_cf_rating_history.get_rating_history.call_count == 0

    def test_stale_row_older_than_ttl_refetches_from_cf(self, monkeypatch, mock_cf_rating_history):
        from datetime import timedelta
        from db.connection import utcnow_naive
        # 25h old — well past the 1h TTL
        row = type("Row", (), {"payload": _PAYLOAD,
                               "fetched_at": utcnow_naive() - timedelta(hours=25)})()
        self._install(monkeypatch, row)

        r = client.get("/api/rating-trajectory/tourist?platform=cf")
        assert r.status_code == 200, r.json()
        assert mock_cf_rating_history.get_rating_history.call_count == 1

    def test_lookup_is_lower_equality_on_either_column_never_like(self, monkeypatch, mock_cf_rating_history):
        from db.connection import utcnow_naive
        row = type("Row", (), {"payload": _PAYLOAD, "fetched_at": utcnow_naive()})()
        sessions = self._install(monkeypatch, row)

        client.get("/api/rating-trajectory/A_B?platform=cf")
        where = sessions[0].captured_stmts[0].compile(
            compile_kwargs={"literal_binds": True}).string.split("WHERE", 1)[1]
        assert "lower(users.cf_handle) = 'a_b'" in where
        assert "lower(users.lc_handle) = 'a_b'" in where
        assert "LIKE" not in where.upper()

    def test_missing_row_falls_through_to_live_fetch(self, monkeypatch, mock_cf_rating_history):
        self._install(monkeypatch, None)
        r = client.get("/api/rating-trajectory/tourist?platform=cf")
        assert r.status_code == 200, r.json()
        assert len(r.json()["points"]) == 2
        assert mock_cf_rating_history.get_rating_history.call_count == 1