"""Backend tests — /health, /analyze, /recommend endpoints."""

import pytest
from unittest.mock import AsyncMock

from platforms.codeforces import _HANDLE_PATTERN

from fastapi.testclient import TestClient
from main import app


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def mock_cf_client(monkeypatch):
    """Replace CFClient in all route modules so tests never hit the real CF API."""
    stub_info = {
        "handle": "tourist", "rating": 3000, "rank": "legendary grandmaster",
        "maxRating": 3979, "maxRank": "legendary grandmaster",
        "avatar": "", "country": "Belarus", "organization": "",
    }
    stub_problems = []

    async def mock_get_user_info(handle):
        if not _HANDLE_PATTERN.match(handle):
            from platforms.codeforces import HandleError
            raise HandleError(f"Invalid characters in handle: '{handle}'")
        return stub_info

    async def mock_get_submissions(handle, **kwargs):
        if not _HANDLE_PATTERN.match(handle):
            from platforms.codeforces import HandleError
            raise HandleError(f"Invalid characters in handle: '{handle}'")
        return []

    async def mock_get_all_submissions(handle, **kwargs):
        if not _HANDLE_PATTERN.match(handle):
            from platforms.codeforces import HandleError
            raise HandleError(f"Invalid characters in handle: '{handle}'")
        return []

    async def mock_get_problemset():
        return stub_problems

    mock = AsyncMock()
    mock.get_user_info = mock_get_user_info
    mock.get_submissions = mock_get_submissions
    mock.get_all_submissions = mock_get_all_submissions
    mock.get_problemset = mock_get_problemset
    monkeypatch.setattr("routes.analyze.CFClient", lambda: mock)
    monkeypatch.setattr("routes.recommend.CFClient", lambda: mock)
    monkeypatch.setattr("routes.progress.CFClient", lambda: mock)
    return mock


@pytest.fixture(autouse=True)
def mock_lc_client(monkeypatch):
    """Replace LeetCodeClient in all route modules so tests never hit the real LC API."""
    mock = AsyncMock()
    mock.get_user_profile.return_value = {
        "handle": "tourist", "easy_solved": 10, "medium_solved": 20, "hard_solved": 5
    }
    mock.get_user_submissions.return_value = []
    mock.get_contest_ranking.return_value = {"rating": 2500}
    mock.get_all_problems.return_value = []
    monkeypatch.setattr("routes.analyze.LeetCodeClient", lambda: mock)
    monkeypatch.setattr("routes.recommend.LeetCodeClient", lambda: mock)
    monkeypatch.setattr("routes.progress.LeetCodeClient", lambda: mock)
    return mock


# ── Tests ────────────────────────────────────────────────────────────────────

client = TestClient(app)


class TestHealth:
    def test_health_returns_ok(self):
        r = client.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["platforms"] == ["cf", "lc"]

    def test_health_deep_returns_downstream_status(self):
        r = client.get("/health/deep")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data
        assert "downstream" in data
        assert "codeforces" in data["downstream"]
        assert "leetcode" in data["downstream"]


class TestAnalyze:
    def test_analyze_cf_invalid_handle_returns_404(self):
        r = client.get("/api/analyze/invalid handle with spaces")
        assert r.status_code in (400, 404)

    def test_analyze_cf_rejects_empty_handle(self):
        r = client.get("/api/analyze/")
        assert r.status_code == 404  # route not matched

    def test_analyze_with_mode_param(self):
        r = client.get("/api/analyze/tourist?platform=cf&mode=quick")
        assert r.status_code == 200, r.json()

    def test_analyze_cf_returns_valid_shape(self):
        r = client.get("/api/analyze/tourist?platform=cf&mode=quick")
        assert r.status_code == 200
        data = r.json()
        assert "topic_profile" in data
        assert "mastery_scores" in data
        assert "model_used" in data


class TestRecommend:
    def test_recommend_cf_returns_problem_list(self):
        r = client.get("/api/recommend/tourist?platforms=cf&top_k=5")
        assert r.status_code == 200, r.json()
        data = r.json()
        assert "recommendations" in data
        assert isinstance(data["recommendations"], list)

    def test_recommend_post_accepts_body(self):
        r = client.post(
            "/api/recommend/tourist",
            json={"platforms": "cf", "top_k": 10, "user_rating": 3000},
        )
        assert r.status_code == 200, r.json()

    def test_recommend_with_focus_topics(self):
        r = client.get("/api/recommend/tourist?platforms=cf&top_k=5&focus_topics=dp,graphs")
        assert r.status_code == 200, r.json()

    def test_recommend_post_with_mastery_scores_returns_mastery_guided(self):
        r = client.post(
            "/api/recommend/tourist",
            json={
                "platforms": "cf",
                "top_k": 5,
                "mastery_scores": {"dp": 0.3, "graphs": 0.5},
                "user_rating": 1800,
            },
        )
        assert r.status_code == 200, r.json()
        assert r.json()["model_used"] == "mastery_guided"

    def test_recommend_post_without_mastery_scores_returns_rule_based(self):
        r = client.post(
            "/api/recommend/tourist",
            json={"platforms": "cf", "top_k": 5},
        )
        assert r.status_code == 200, r.json()
        assert r.json()["model_used"] == "rule_based"

    def test_recommend_post_body_too_large_returns_413(self):
        """Body > 1MB should be rejected by MaxBodySizeMiddleware."""
        big_body = "x" * (1_000_001)  # 1 MB + 1 byte
        r = client.post(
            "/api/recommend/tourist",
            content='{"data": "' + big_body + '"}',
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 413, f"Expected 413, got {r.status_code}: {r.text[:200]}"
        data = r.json()
        assert "detail" in data
        assert "too large" in data["detail"].lower()

    # NOTE: TestClient (httpx) auto-sets Content-Length, so a malformed header
    # test (e.g. content-length: not_a_number) cannot be written via TestClient.
    # The fix is verified by code review: MaxBodySizeMiddleware.dispatch() wraps
    # int(content_length) in try/except (ValueError, TypeError), defaulting to 0.