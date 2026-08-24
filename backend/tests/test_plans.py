"""Greenhouse Phase 5b — /api/plans CRUD tests (in-memory fake AsyncSessionLocal).

The test suite runs without DATABASE_URL, so the plans route's DB access is
replaced with a dict-backed fake session that mirrors the minimal SQLAlchemy
surface the route uses (select/execute/scalar_one_or_none/scalars/add/commit/
refresh/delete/flush). Failure paths are exercised with a session whose
``execute`` raises SQLAlchemyError.
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from main import app
from routes import plans as plans_mod
from db.connection import User, Plan

client = TestClient(app)


class FakeUser:
    _seq = 0

    def __init__(self, cf_handle=None):
        FakeUser._seq += 1
        self.id = FakeUser._seq
        self.cf_handle = cf_handle
        self.lc_handle = None


class FakePlan:
    _seq = 0

    def __init__(self, user_id, name, payload):
        FakePlan._seq += 1
        self.id = FakePlan._seq
        self.user_id = user_id
        self.name = name
        self.payload = payload
        # Deterministic updated_at ordering: newer plans get later dates.
        self.created_at = datetime(2026, 1, self.id, tzinfo=timezone.utc)
        self.updated_at = datetime(2026, 1, self.id, tzinfo=timezone.utc)


class FakeStore:
    def __init__(self):
        self.users = []
        self.plans = []


class FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def first(self):
        return self._value

    def all(self):
        return self._value


class FakeSession:
    def __init__(self, store):
        self._store = store

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def _match_user(self, stmt):
        """Resolve the handle bound in the (cf | lc) ilike criteria, else None."""
        handle = None
        for crit in stmt._where_criteria:
            for cl in getattr(crit, "clauses", [crit]):
                v = getattr(getattr(cl, "right", None), "value", None)
                if isinstance(v, str):
                    handle = v
        if handle is None:
            return None
        for u in self._store.users:
            if (u.cf_handle or "").lower() == handle.lower():
                return u
            if (u.lc_handle or "").lower() == handle.lower():
                return u
        return None

    async def execute(self, stmt):
        entity = stmt.column_descriptions[0]["entity"]
        if entity is User:
            return FakeResult(self._match_user(stmt))
        cols = {
            wc.left.name: getattr(getattr(wc, "right", None), "value", None)
            for wc in stmt._where_criteria
        }
        if "id" in cols:
            pid = cols["id"]
            uid = cols.get("user_id")
            plan = next(
                (
                    p
                    for p in self._store.plans
                    if p.id == pid and (uid is None or p.user_id == uid)
                ),
                None,
            )
            return FakeResult(plan)
        if "user_id" in cols:
            ordered = sorted(
                (p for p in self._store.plans if p.user_id == cols["user_id"]),
                key=lambda p: p.updated_at,
                reverse=True,
            )
            return FakeResult(ordered)
        return FakeResult(None)

    def add(self, obj):
        if isinstance(obj, User):
            FakeUser._seq += 1
            obj.id = FakeUser._seq  # pyright: ignore[reportAttributeAccessIssue]
            self._store.users.append(obj)
        elif isinstance(obj, Plan):
            FakePlan._seq += 1
            obj.id = FakePlan._seq  # pyright: ignore[reportAttributeAccessIssue]
            obj.created_at = datetime(2026, 1, obj.id, tzinfo=timezone.utc)  # pyright: ignore[reportAttributeAccessIssue, reportArgumentType]
            obj.updated_at = datetime(2026, 1, obj.id, tzinfo=timezone.utc)  # pyright: ignore[reportAttributeAccessIssue, reportArgumentType]
            self._store.plans.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, obj):
        pass

    async def delete(self, obj):
        if obj in self._store.plans:
            self._store.plans.remove(obj)


class FailingSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def execute(self, stmt):
        raise SQLAlchemyError("db down")


@pytest.fixture
def fake_db(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(plans_mod, "AsyncSessionLocal", lambda: FakeSession(store))
    return store


def _plan(name, payload=None):
    return {"name": name, "payload": payload or {"items": [{"problem_id": "cf-1A", "done": False}]}}


class TestPlansCrud:
    def test_get_empty_returns_list(self, fake_db):
        r = client.get("/api/plans/tourist")
        assert r.status_code == 200
        assert r.json() == []

    def test_post_creates_plan(self, fake_db):
        r = client.post("/api/plans/tourist", json=_plan("Week 1"))
        assert r.status_code == 201
        body = r.json()
        assert body["id"] == 1
        assert body["name"] == "Week 1"
        assert body["payload"]["items"][0]["problem_id"] == "cf-1A"
        assert body["created_at"] is not None

    def test_get_lists_newest_first(self, fake_db):
        client.post("/api/plans/tourist", json=_plan("older"))
        client.post("/api/plans/tourist", json=_plan("newer"))
        r = client.get("/api/plans/tourist")
        names = [p["name"] for p in r.json()]
        assert names == ["newer", "older"]

    def test_put_updates_plan(self, fake_db):
        created = client.post("/api/plans/tourist", json=_plan("Week 1")).json()
        r = client.put(f"/api/plans/tourist/{created['id']}", json={"name": "Week 1 v2", "payload": {"items": []}})
        assert r.status_code == 200
        assert r.json()["name"] == "Week 1 v2"
        assert r.json()["payload"]["items"] == []

    def test_delete_removes_plan(self, fake_db):
        created = client.post("/api/plans/tourist", json=_plan("Week 1")).json()
        r = client.delete(f"/api/plans/tourist/{created['id']}")
        assert r.status_code == 200
        assert r.json()["deleted"] is True
        assert client.get("/api/plans/tourist").json() == []

    def test_put_unknown_plan_404(self, fake_db):
        r = client.put("/api/plans/tourist/999", json=_plan("ghost"))
        assert r.status_code == 404

    def test_delete_unknown_plan_404(self, fake_db):
        r = client.delete("/api/plans/tourist/999")
        assert r.status_code == 404


class TestPlansOwnership:
    """IDOR: writes must be scoped to the URL handle's own plans."""

    def test_put_other_users_plan_404(self, fake_db):
        client.post("/api/plans/alice", json=_plan("Alice plan"))
        client.post("/api/plans/bob", json=_plan("Bob plan"))  # bob exists
        r = client.put("/api/plans/bob/1", json=_plan("hijacked"))
        assert r.status_code == 404
        assert [p["name"] for p in client.get("/api/plans/alice").json()] == ["Alice plan"]

    def test_delete_other_users_plan_404(self, fake_db):
        client.post("/api/plans/alice", json=_plan("Alice plan"))
        client.post("/api/plans/bob", json=_plan("Bob plan"))
        r = client.delete("/api/plans/bob/1")
        assert r.status_code == 404
        assert [p["name"] for p in client.get("/api/plans/alice").json()] == ["Alice plan"]

    def test_put_unknown_handle_404(self, fake_db):
        client.post("/api/plans/alice", json=_plan("Alice plan"))
        r = client.put("/api/plans/ghost/1", json=_plan("ghosted"))
        assert r.status_code == 404

    def test_delete_unknown_handle_404(self, fake_db):
        client.post("/api/plans/alice", json=_plan("Alice plan"))
        assert client.delete("/api/plans/ghost/1").status_code == 404


class TestPlansFailures:
    def test_get_db_failure_returns_empty(self, monkeypatch):
        monkeypatch.setattr(plans_mod, "AsyncSessionLocal", lambda: FailingSession())
        r = client.get("/api/plans/tourist")
        assert r.status_code == 200
        assert r.json() == []

    def test_post_db_failure_is_502(self, monkeypatch):
        monkeypatch.setattr(plans_mod, "AsyncSessionLocal", lambda: FailingSession())
        r = client.post("/api/plans/tourist", json=_plan("Week 1"))
        assert r.status_code == 502