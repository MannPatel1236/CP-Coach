"""Greenhouse Phase 4b — mastery history: model checkpoints + route contracts."""

import pytest

from data.topic_graph import CPTopicGraph


# ── Model unit tests (torch required — CI installs torch 2.2.2 CPU) ──────────

def _make_sequence(n_rows: int = 30) -> list[dict]:
    topics = CPTopicGraph.TOPICS
    return [
        {
            "topic": topics[i % len(topics)],
            "solved": 1 if i % 3 else 0,
            "difficulty": 1500 / 4000.0,
            "timestamp_delta": 0.5,
            "weight": 1.0,
            "timestamp": 1_600_000_000_000 + i * 86_400_000,  # ms, daily
        }
        for i in range(n_rows)
    ]


class TestPredictMasteryHistory:
    def test_returns_29_topics_with_8_checkpoints(self):
        pytest.importorskip("torch")
        from models.graph_dkt import GraphDKTModel
        tg = CPTopicGraph()
        model = GraphDKTModel(num_topics=tg.num_topics, topic_graph=tg)
        history = model.predict_mastery_history(_make_sequence(), tg, n_checkpoints=8)
        assert set(history.keys()) == set(tg.TOPICS)
        for topic, cps in history.items():
            assert len(cps) == 8
            assert all(0.0 <= cp["p"] <= 1.0 for cp in cps)
            assert all(cp["ts"] > 0 for cp in cps)
            # Chronological order — checkpoints march forward in time
            ts_list = [cp["ts"] for cp in cps]
            assert ts_list == sorted(ts_list)

    def test_short_sequence_dedupes_to_sequence_length(self):
        pytest.importorskip("torch")
        from models.graph_dkt import GraphDKTModel
        tg = CPTopicGraph()
        model = GraphDKTModel(num_topics=tg.num_topics, topic_graph=tg)
        history = model.predict_mastery_history(_make_sequence(n_rows=3), tg, n_checkpoints=8)
        assert len(history["implementation"]) == 3  # deduped — no repeated rows

    def test_single_checkpoint_takes_last_row(self):
        pytest.importorskip("torch")
        from models.graph_dkt import GraphDKTModel
        tg = CPTopicGraph()
        model = GraphDKTModel(num_topics=tg.num_topics, topic_graph=tg)
        seq = _make_sequence(n_rows=10)
        history = model.predict_mastery_history(seq, tg, n_checkpoints=1)
        assert len(history["implementation"]) == 1
        assert history["implementation"][0]["ts"] == seq[-1]["timestamp"]


# ── Route contracts (no DB in CI — tests the never-404 / null-and-note paths) ─

from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


class TestMasteryHistoryRoute:
    def test_get_returns_null_with_note_when_no_snapshot(self):
        # DATABASE_URL is unset in tests → _read_mastery_history raises → caught →
        # null + note. The contract: never an error (spec §5.2 #6).
        r = client.get("/api/mastery-history/tourist?platform=cf")
        assert r.status_code == 200
        data = r.json()
        assert data["mastery_history"] is None
        assert data["note"]

    def test_analyze_inlines_history_when_graph_dkt_model_runs(self, monkeypatch):
        # Need a CF submission so the sequence is non-empty (model only runs then)
        async def one_sub(handle, **kwargs):
            return [{
                "problem": {"contestId": 1, "index": "A", "rating": 1500, "tags": ["implementation"]},
                "verdict": "OK", "creationTimeSeconds": 1600000000,
            }]
        from unittest.mock import AsyncMock
        from platforms.codeforces import _HANDLE_PATTERN

        async def mock_get_user_info(handle):
            if not _HANDLE_PATTERN.match(handle):
                from platforms.codeforces import HandleError
                raise HandleError(f"Invalid characters in handle: '{handle}'")
            return {"handle": "tourist", "rating": 1500, "rank": "specialist"}

        stub = AsyncMock()
        stub.get_user_info = mock_get_user_info
        stub.get_submissions = one_sub
        monkeypatch.setattr("routes.analyze.CFClient", lambda: stub)

        class FakeModel:
            def __init__(self):
                self.n_calls = 0

            def predict_mastery_full(self, sequence, topic_graph, n_checkpoints=8):
                self.n_calls += 1
                mastery = {t: 0.5 for t in topic_graph.TOPICS}
                history = {
                    t: [{"ts": 1_600_000_000_000 + i * 1000, "p": 0.4 + 0.1 * (i / 7)} for i in range(8)]
                    for t in topic_graph.TOPICS
                }
                return mastery, history

        fake = FakeModel()
        app.state.graph_dkt_model = fake
        try:
            r = client.get("/api/analyze/tourist?platform=cf&mode=quick")
            assert r.status_code == 200, r.json()
            data = r.json()
            assert data["model_used"] == "graph_dkt"
            assert fake.n_calls == 1, "mastery + checkpoints must share ONE forward pass"
            assert data["mastery_history"] is not None
            assert len(data["mastery_history"]) == 29
            assert len(data["mastery_history"]["implementation"]) == 8
        finally:
            app.state.graph_dkt_model = None

    def test_analyze_with_legacy_predict_only_model_leaves_history_none(self, monkeypatch):
        """Models exposing only predict_mastery still analyze, but cannot inline
        temporal checkpoints — history degrades to None (disabled UI caption)."""
        from unittest.mock import AsyncMock

        async def one_sub(handle, **kwargs):
            return [{
                "problem": {"contestId": 1, "index": "A", "rating": 1500, "tags": ["implementation"]},
                "verdict": "OK", "creationTimeSeconds": 1600000000,
            }]
        from platforms.codeforces import _HANDLE_PATTERN

        async def mock_get_user_info(handle):
            if not _HANDLE_PATTERN.match(handle):
                from platforms.codeforces import HandleError
                raise HandleError(f"Invalid characters in handle: '{handle}'")
            return {"handle": "tourist", "rating": 1500, "rank": "specialist"}

        stub = AsyncMock()
        stub.get_user_info = mock_get_user_info
        stub.get_submissions = one_sub
        monkeypatch.setattr("routes.analyze.CFClient", lambda: stub)

        class LegacyModel:
            def __init__(self):
                self.n_calls = 0

            def predict_mastery(self, sequence, topic_graph):
                self.n_calls += 1
                return {t: 0.5 for t in topic_graph.TOPICS}

        fake = LegacyModel()
        app.state.graph_dkt_model = fake
        try:
            r = client.get("/api/analyze/tourist?platform=cf&mode=quick")
            assert r.status_code == 200, r.json()
            data = r.json()
            assert data["model_used"] == "graph_dkt"
            assert fake.n_calls == 1
            assert data["mastery_history"] is None
        finally:
            app.state.graph_dkt_model = None