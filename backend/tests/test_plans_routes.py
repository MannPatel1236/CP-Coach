"""Plans CRUD route contracts (gate findings: PUT/DELETE failure paths untested).

Uses a fake AsyncSessionLocal so the read-failure→[] / write-failure→502 /
missing-plan→404 contracts are pinned without a live database.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from db.connection import Plan
from main import app

client = TestClient(app)


class _FakeResult:
    """Mimics the two result shapes plans.py consumes."""

    def __init__(self, value=None, rows=None):
        self._value = value
        self._rows = rows or []

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _FakeSession:
    """Ordered-result queue: each execute() pops the next result. fail=True raises."""

    def __init__(self, results=None, fail=False):
        self._results = list(results or [])
        self._fail = fail
        self.added = []
        self.deleted = []
        self.commits = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def execute(self, _stmt):
        if self._fail:
            raise SQLAlchemyError("db down")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        self._assign_ids()

    async def commit(self):
        self.commits += 1
        self._assign_ids()

    async def refresh(self, _obj):
        return None

    async def delete(self, obj):
        self.deleted.append(obj)

    def _assign_ids(self):
        for i, obj in enumerate(self.added):
            if getattr(obj, "id", None) is None:
                obj.id = 100 + i


@pytest.fixture
def fake_db(monkeypatch):
    """Installs a fresh _FakeSession per call; returns the installer."""
    def install(*results, fail=False):
        session = _FakeSession(results, fail=fail)
        monkeypatch.setattr("routes.plans.AsyncSessionLocal", lambda: session)
        return session
    return install


USER = SimpleNamespace(id=7)
PLAN_BODY = {"name": "Week of 2026-08-23", "payload": {"items": []}}


class TestPlansContracts:
    def test_get_unknown_handle_returns_empty_list(self, fake_db):
        # First execute = user lookup → None → route short-circuits to [].
        fake_db(_FakeResult(None))
        r = client.get("/api/plans/ghost")
        assert r.status_code == 200
        assert r.json() == []

    def test_get_read_failure_returns_empty_list_never_error(self, fake_db):
        fake_db(fail=True)
        r = client.get("/api/plans/mannpatel")
        assert r.status_code == 200
        assert r.json() == []

    def test_post_creates_plan_and_assigns_server_id(self, fake_db):
        fake_db(_FakeResult(None))  # user lookup → no user yet
        r = client.post("/api/plans/mannpatel", json=PLAN_BODY)
        assert r.status_code == 201, r.json()
        body = r.json()
        assert body["name"] == PLAN_BODY["name"]
        assert body["id"] == 101  # second added object (user got 100)

    def test_post_write_failure_returns_502(self, fake_db):
        fake_db(fail=True)
        r = client.post("/api/plans/mannpatel", json=PLAN_BODY)
        assert r.status_code == 502
        # Global error handler reshapes HTTPException → {code, message}
        assert "unavailable" in r.json()["message"]

    def test_put_missing_plan_returns_404(self, fake_db):
        fake_db(_FakeResult(USER), _FakeResult(None))
        r = client.put("/api/plans/mannpatel/999", json=PLAN_BODY)
        assert r.status_code == 404

    def test_put_write_failure_returns_502(self, fake_db):
        fake_db(fail=True)
        r = client.put("/api/plans/mannpatel/1", json=PLAN_BODY)
        assert r.status_code == 502

    def test_delete_missing_plan_returns_404(self, fake_db):
        fake_db(_FakeResult(None))  # no user → plan stays None → 404
        r = client.delete("/api/plans/mannpatel/999")
        assert r.status_code == 404

    def test_delete_existing_plan_returns_deleted_true(self, fake_db):
        plan = Plan(id=5, user_id=7, name="old", payload={})
        session = fake_db(_FakeResult(USER), _FakeResult(plan))
        r = client.delete("/api/plans/mannpatel/5")
        assert r.status_code == 200
        assert r.json() == {"deleted": True}
        assert [p.id for p in session.deleted] == [5]

    def test_delete_write_failure_returns_502(self, fake_db):
        fake_db(fail=True)
        r = client.delete("/api/plans/mannpatel/5")
        assert r.status_code == 502


class TestPlansBodyLimitAndAuth:
    """MaxBodySizeMiddleware covers PUT too; HMAC opt-in locks plans when set."""

    def test_oversized_post_body_rejected_413(self, fake_db):
        # Middleware short-circuits before any DB touch — no fake results needed.
        fake_db()
        big = {"name": "x" * 1_100_000, "payload": {}}
        r = client.post("/api/plans/mannpatel", json=big)
        assert r.status_code == 413

    def test_oversized_put_body_rejected_413(self, fake_db):
        fake_db()
        big = {"name": "x" * 1_100_000, "payload": {}}
        r = client.put("/api/plans/mannpatel/1", json=big)
        assert r.status_code == 413

    def test_normal_size_post_passes_middleware(self, fake_db):
        fake_db(_FakeResult(None))
        r = client.post("/api/plans/mannpatel", json=PLAN_BODY)
        assert r.status_code == 201

    def _hmac_headers(self, handle, ts=None):
        import time
        from auth import _hmac_sign
        ts = ts or str(int(time.time()))
        return {"Authorization": f"HMAC {_hmac_sign(ts, handle)}", "X-Timestamp": ts}

    def test_unsigned_post_rejected_401_when_secret_set(self, fake_db, monkeypatch):
        import auth as auth_mod
        monkeypatch.setattr(auth_mod, "_API_SECRET", "test-secret")
        fake_db(_FakeResult(None))
        r = client.post("/api/plans/mannpatel", json=PLAN_BODY)
        assert r.status_code == 401

    def test_signed_post_passes_and_creates_plan(self, fake_db, monkeypatch):
        import auth as auth_mod
        monkeypatch.setattr(auth_mod, "_API_SECRET", "test-secret")
        fake_db(_FakeResult(None))
        r = client.post("/api/plans/mannpatel", json=PLAN_BODY,
                        headers=self._hmac_headers("mannpatel"))
        assert r.status_code == 201, r.json()
        assert r.json()["id"] == 101

    def test_signature_bound_to_other_handle_rejected_401(self, fake_db, monkeypatch):
        import auth as auth_mod
        monkeypatch.setattr(auth_mod, "_API_SECRET", "test-secret")
        fake_db(_FakeResult(None))
        r = client.post("/api/plans/mannpatel", json=PLAN_BODY,
                        headers=self._hmac_headers("someone-else"))
        assert r.status_code == 401
