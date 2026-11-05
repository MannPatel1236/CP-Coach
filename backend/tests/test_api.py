"""Backend tests — /health, /analyze, /recommend endpoints."""

import pytest
from unittest.mock import AsyncMock

from data.topic_graph import CPTopicGraph
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

    async def mock_get_rating_history(handle):
        if not _HANDLE_PATTERN.match(handle):
            from platforms.codeforces import HandleError
            raise HandleError(f"Invalid characters in handle: '{handle}'")
        return []

    mock = AsyncMock()
    mock.get_user_info = mock_get_user_info
    mock.get_submissions = mock_get_submissions
    mock.get_all_submissions = mock_get_all_submissions
    mock.get_problemset = mock_get_problemset
    mock.get_rating_history = mock_get_rating_history
    monkeypatch.setattr("routes.analyze.CFClient", lambda: mock)
    monkeypatch.setattr("routes.recommend.CFClient", lambda: mock)
    monkeypatch.setattr("routes.progress.CFClient", lambda: mock)
    monkeypatch.setattr("routes.trajectory.CFClient", lambda: mock)
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

    def test_analyze_rule_path_omits_untrained_topics(self):
        """Zero-corpus topics have no CF evidence → absent keys, not 0.0 fills
        (0.0 reads as maximally weak and poisons the recommender's weak set)."""
        r = client.get("/api/analyze/tourist?platform=cf&mode=quick")
        assert r.status_code == 200
        mastery = r.json()["mastery_scores"]
        assert set(CPTopicGraph.UNTRAINED_TOPICS).isdisjoint(mastery)
        assert "implementation" in mastery  # unseen trained topics still 0.0-filled


class _AllTopicsModel:
    """Stands in for the ensemble: 29-topic output with the untrained four at a
    flat 0.5 — the garbage the real untrained output units emit."""

    def predict_mastery_full(self, sequence, topic_graph, n_checkpoints=8):
        mastery = {t: 0.8 for t in topic_graph.TOPICS}
        mastery.update({t: 0.5 for t in topic_graph.UNTRAINED_TOPICS})
        history = {t: [{"ts": 1, "p": 0.5}] for t in topic_graph.TOPICS}
        weekly = {t: [{"week": "2026-W40", "p": 0.5}] for t in topic_graph.TOPICS}
        return mastery, history, weekly


_SEQ = [{"topic": "dp", "solved": 1, "difficulty": 0.4, "timestamp_delta": 0.1, "weight": 1.0}]


def _lc_sub(topic, pid):
    return {"problem_id": pid, "platform": "lc", "verdict": "OK",
            "topics": [topic], "difficulty": 1500, "timestamp": 1}


class TestComputeMasteryUntrained:
    def test_model_output_for_untrained_topics_is_never_exposed(self):
        from routes.analyze import _compute_mastery

        mastery, model_used, history, weekly = _compute_mastery(
            _SEQ, [], preloaded_model=_AllTopicsModel())
        assert model_used == "graph_dkt"
        assert history is not None and weekly is not None
        assert set(CPTopicGraph.UNTRAINED_TOPICS).isdisjoint(mastery)
        assert set(CPTopicGraph.UNTRAINED_TOPICS).isdisjoint(history)
        assert set(CPTopicGraph.UNTRAINED_TOPICS).isdisjoint(weekly)
        assert mastery["dp"] == 0.8  # trained topics keep model values

    def test_untrained_topic_keeps_rule_evidence_when_it_exists(self):
        from routes.analyze import _compute_mastery

        mastery, model_used, _, _ = _compute_mastery(
            _SEQ, [_lc_sub("backtracking", "lc-backtracking-1")],
            preloaded_model=_AllTopicsModel())
        assert model_used == "graph_dkt"
        # Real LC evidence → rule solve_rate (1/1), not the model's flat 0.5.
        assert mastery["backtracking"] == 1.0
        # No evidence → absent (not 0.0, not the model's 0.5).
        assert "prefix_sum" not in mastery


class TestRecommendUntrained:
    def test_rule_path_never_recommends_untrained_topics(self):
        """GET-path mastery build must not 0.0-fill the untrained four — a 0.0
        fill puts them in the weak set, surfacing LC problems for topics the
        user never practiced (and dragging their prereqs into FOUNDATION)."""
        from routes.recommend import _run_recommender

        # Weak on dp only; everything else strong enough to stay out of the
        # capped weak set.
        subs = [_lc_sub("dp", f"lc-dp-{i}") for i in range(3)]
        subs[0]["verdict"] = "WRONG_ANSWER"
        subs[1]["verdict"] = "WRONG_ANSWER"
        strong = [t for t in CPTopicGraph.TOPICS
                  if t not in CPTopicGraph.UNTRAINED_TOPICS and t not in ("dp", "brute_force")]
        for t in strong:
            subs.extend(_lc_sub(t, f"lc-{t}-{i}") for i in range(2))

        def problem(pid, topic):
            return {"problem_id": pid, "platform": "lc", "name": pid, "difficulty": 1100,
                    "topics": [topic], "solve_count": 500, "url": ""}

        resp = _run_recommender(
            handle="u", platform_list=["lc"], focus_topics_str=None, top_k=20,
            all_problems=[problem("lc-dp-p", "dp"),
                          problem("lc-bt-p", "backtracking"),
                          problem("lc-prefix-p", "prefix_sum")],
            normalized_subs=subs, fetched_solved_ids=set(), fetched_user_rating=1200,
            mastery_scores_override=None, solved_ids_override=None,
            user_rating_override=None, model_used="rule_based", fetch_errors=[],
        )
        recs = resp["recommendations"]
        assert any(r["problem_id"] == "lc-dp-p" for r in recs)  # real weakness still works
        untrained = set(CPTopicGraph.UNTRAINED_TOPICS)
        for r in recs:
            assert untrained.isdisjoint(r["matched_topics"]), r
            assert r.get("trigger_weak_tag") not in untrained, r


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

    def test_recommend_post_skips_submission_refetch_when_overrides_supplied(self, monkeypatch):
        """POST carries solved_ids + mastery from the analyze pass; refetching the
        submission history would duplicate CF/LC traffic for data already in hand."""
        calls = {"subs": 0}
        import routes.recommend as rec

        original = rec.CFClient

        class Counting:
            def __getattr__(self, name):
                inner = original()
                if name == "get_submissions":
                    async def counted(*a, **k):
                        calls["subs"] += 1
                        return await inner.get_submissions(*a, **k)
                    return counted
                return getattr(inner, name)

        monkeypatch.setattr("routes.recommend.CFClient", Counting)
        r = client.post(
            "/api/recommend/tourist",
            json={
                "platforms": "cf",
                "top_k": 5,
                "mastery_scores": {"dp": 0.3},
                "solved_ids": ["cf-1A"],
                "user_rating": 1800,
            },
        )
        assert r.status_code == 200, r.json()
        assert calls["subs"] == 0

    def test_recommend_post_invalid_handle_is_400_even_with_overrides(self):
        """Overrides must not turn a bad handle into a silent empty result."""
        r = client.post(
            "/api/recommend/bad_handle!",
            json={
                "platforms": "cf",
                "top_k": 5,
                "mastery_scores": {"dp": 0.3},
                "solved_ids": ["cf-1A"],
            },
        )
        assert r.status_code == 400, r.json()
        assert "VALIDATION_ERROR" == r.json()["code"]

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