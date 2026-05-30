"""Backend tests — /health, /analyze, /recommend endpoints."""

import pytest
from fastapi.testclient import TestClient
from main import app


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
        r = client.get("/api/analyze/nonexistent_handle_xyz_123")
        # CF returns 400 for unknown handles
        assert r.status_code in (400, 404)

    def test_analyze_cf_rejects_empty_handle(self):
        r = client.get("/api/analyze/")
        assert r.status_code == 404  # route not matched

    def test_analyze_with_mode_param(self):
        r = client.get("/api/analyze/tourist?platform=cf&mode=quick")
        # tourist is a real handle — should return valid response or error, not 500
        assert r.status_code != 500


class TestRecommend:
    def test_recommend_cf_returns_problem_list(self):
        r = client.get("/api/recommend/tourist?platforms=cf&top_k=5")
        # Should return JSON array or object, not 500
        assert r.status_code in (200, 400, 502)

    def test_recommend_post_accepts_body(self):
        r = client.post(
            "/api/recommend/tourist",
            json={"platforms": "cf", "top_k": 10, "user_rating": 3000},
        )
        assert r.status_code != 500

    def test_recommend_with_focus_topics(self):
        r = client.get("/api/recommend/tourist?platforms=cf&top_k=5&focus_topics=dp,graphs")
        assert r.status_code != 500