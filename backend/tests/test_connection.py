"""db.connection helper contracts — handle-resolution SQL + timestamp codec.

Regression guard for the gate's cross-user-leak finding: find_user_by_handle
must compile to lower()== equality (never ilike/LIKE, since '_' is both a legal
CF-handle char and a LIKE wildcard), scoped to the requested platform column.
"""

import pytest

from db.connection import User, find_user_by_handle, get_or_create_user, utcnow_naive


class _FakeResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSession:
    """Captures the SELECT find_user_by_handle builds; records add()/flush()."""

    def __init__(self, lookup_value=None):
        self.lookup_value = lookup_value
        self.captured_stmt = None
        self.added = []

    async def execute(self, stmt):
        self.captured_stmt = stmt
        return _FakeResult(self.lookup_value)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for i, obj in enumerate(self.added):
            if getattr(obj, "id", None) is None:
                obj.id = 100 + i


def _compiled_where(stmt) -> str:
    """WHERE-clause text only — the SELECT projection always lists both columns."""
    sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
    # Compiled SQL puts WHERE at line start ("FROM users\nWHERE ...")
    return sql.split("WHERE", 1)[1] if "WHERE" in sql else ""


class TestFindUserByHandleSql:
    @pytest.mark.asyncio
    async def test_no_platform_matches_either_column_with_lower_equality(self):
        session = _FakeSession()
        await find_user_by_handle(session, "Tourist")
        sql = _compiled_where(session.captured_stmt)
        assert "lower(users.cf_handle) = 'tourist'" in sql
        assert "lower(users.lc_handle) = 'tourist'" in sql
        # The leak this guards against: LIKE/ILIKE would let '_' match any char
        assert "LIKE" not in sql.upper()

    @pytest.mark.asyncio
    async def test_underscore_handle_compiles_to_literal_not_wildcard(self):
        session = _FakeSession()
        await find_user_by_handle(session, "a_b")
        sql = _compiled_where(session.captured_stmt)
        assert "'a_b'" in sql
        assert "LIKE" not in sql.upper(), "'_' must stay a literal char, not a wildcard"

    @pytest.mark.asyncio
    async def test_cf_platform_scopes_to_cf_column_only(self):
        session = _FakeSession()
        await find_user_by_handle(session, "mannpatel", "cf")
        sql = _compiled_where(session.captured_stmt)
        assert "lower(users.cf_handle) = 'mannpatel'" in sql
        assert "lc_handle" not in sql

    @pytest.mark.asyncio
    async def test_lc_platform_scopes_to_lc_column_only(self):
        session = _FakeSession()
        await find_user_by_handle(session, "mannpatel", "lc")
        sql = _compiled_where(session.captured_stmt)
        assert "lower(users.lc_handle) = 'mannpatel'" in sql
        assert "cf_handle" not in sql

    @pytest.mark.asyncio
    async def test_found_user_returned(self):
        expected = User(id=7, cf_handle="x")
        session = _FakeSession(lookup_value=expected)
        assert await find_user_by_handle(session, "x") is expected


class TestGetOrCreateUser:
    @pytest.mark.asyncio
    async def test_existing_row_reused_without_insert(self):
        existing = User(id=5, cf_handle="mannpatel")
        session = _FakeSession(lookup_value=existing)
        user = await get_or_create_user(session, "MannPatel", "cf")
        assert user is existing
        assert session.added == []

    @pytest.mark.asyncio
    async def test_missing_row_created_keyed_to_platform(self):
        for platform, col, other in (("cf", "cf_handle", "lc_handle"), ("lc", "lc_handle", "cf_handle")):
            session = _FakeSession(lookup_value=None)
            user = await get_or_create_user(session, "newbie", platform)
            assert len(session.added) == 1
            # getattr → Any: classic Base types instance attrs as Column, so a
            # direct `user.id == x` assert trips reportGeneralTypeIssues.
            assert getattr(user, "id") == 100
            assert getattr(user, col) == "newbie"
            assert getattr(user, other) is None
            assert getattr(user, "primary_platform") == platform


def test_utcnow_naive_is_tzinfo_less():
    # asyncpg's naive-timestamp codec raises DataError on aware datetimes
    assert utcnow_naive().tzinfo is None
