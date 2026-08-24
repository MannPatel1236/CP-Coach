"""GDPR erasure route contracts — DELETE /api/user/{handle}.

Route-level coverage for the identity swap this range made: the ilike→exact
lookup fix must never regress to a wildcard (underscore handles), erasure must
cover BOTH halves of a dual-platform identity in one call, and a missing
handle stays a 404. Until this file existed, no test anywhere hit the route.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from main import app

client = TestClient(app)


class _DeleteResult:
    def __init__(self, rowcount):
        self.rowcount = rowcount


class _FakeSession:
    """Captures the DELETE statement; returns the given rowcount or raises."""

    def __init__(self, rowcount=1, fail=False):
        self._rowcount = rowcount
        self._fail = fail
        self.captured_stmt = None
        self.commits = 0
        self.rollbacks = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def execute(self, stmt):
        if self._fail:
            raise SQLAlchemyError("db down")
        self.captured_stmt = stmt
        return _DeleteResult(self._rowcount)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


@pytest.fixture
def fake_db(monkeypatch):
    def install(session):
        monkeypatch.setattr("routes.user.AsyncSessionLocal", lambda: session)
        return session
    return install


class TestGdprErasure:
    def test_existing_handle_deletes_and_returns_200(self, fake_db):
        session = fake_db(_FakeSession(rowcount=1))
        r = client.delete("/api/user/mannpatel")
        assert r.status_code == 200, r.json()
        assert "deleted" in r.json()["message"].lower()
        assert session.commits == 1

    def test_dual_platform_twin_rows_deleted_in_one_call(self, fake_db):
        session = fake_db(_FakeSession(rowcount=2))
        r = client.delete("/api/user/mannpatel")
        assert r.status_code == 200
        assert session.captured_stmt is not None

    def test_unknown_handle_returns_404_without_commit(self, fake_db):
        session = fake_db(_FakeSession(rowcount=0))
        r = client.delete("/api/user/ghost")
        assert r.status_code == 404
        assert session.commits == 0

    def test_db_failure_returns_500_after_rollback(self, fake_db):
        session = fake_db(_FakeSession(fail=True))
        r = client.delete("/api/user/mannpatel")
        assert r.status_code == 500
        assert session.rollbacks == 1

    def test_delete_sql_is_exact_equality_never_wildcard(self, fake_db):
        """'_' is a legal CF handle char AND a LIKE wildcard — an ilike here
        could erase stranger 'aXb' when asked for 'a_b'."""
        session = fake_db(_FakeSession(rowcount=1))
        client.delete("/api/user/a_b")
        sql = str(session.captured_stmt.compile(compile_kwargs={"literal_binds": True}))
        where = sql.split("WHERE", 1)[1]
        assert "lower(users.cf_handle) = 'a_b'" in where
        assert "lower(users.lc_handle) = 'a_b'" in where
        assert "LIKE" not in where.upper()

    def test_delete_invalidates_memory_derived_caches(self, fake_db):
        """Erasure must reach the process-memory tiers too — progress/trajectory
        would otherwise keep serving the erased handle's aggregates for up to
        their TTLs after the 200."""
        import time

        from routes import progress as prog_mod
        from routes import trajectory as traj_mod

        prog_mod._progress_cache["cf:x"] = (time.time(), {"2026-W01": {}}, {})
        prog_mod._progress_cache["lc:x"] = (time.time(), {}, {})
        traj_mod._cache["cf:x"] = (time.time(), [])

        session = fake_db(_FakeSession(rowcount=1))
        r = client.delete("/api/user/x")
        assert r.status_code == 200
        assert session.commits == 1
        assert "cf:x" not in prog_mod._progress_cache
        assert "lc:x" not in prog_mod._progress_cache
        assert "cf:x" not in traj_mod._cache
