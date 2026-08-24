"""SQLAlchemy async engine + ORM models."""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    Column, Integer, String, Float, BigInteger, ForeignKey, TIMESTAMP, ARRAY, Text,
    case, delete, func, select,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")


def _ensure_db_url() -> str:
    """Return the DATABASE_URL with the asyncpg driver prefix.

    Render, Supabase, and most managed Postgres providers hand out
    ``postgresql://user:pass@host/db`` URLs. ``create_async_engine``
    requires the explicit ``postgresql+asyncpg://`` scheme. We auto-fix
    the scheme on read so the user only needs to paste the provider's
    URL into the Render env panel.
    """
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is required")
    url = DATABASE_URL
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


class _LazyEngine:
    """Lazily initializes the async engine on first connect()."""
    def __init__(self):
        self._engine = None

    def _get(self):
        if self._engine is None:
            url = _ensure_db_url()
            scheme = url.split("://", 1)[0]
            host_part = url.rsplit("@", 1)[-1]
            logger.info("DB engine: scheme=%s host=%s", scheme, host_part)
            self._engine = create_async_engine(
                url, echo=False, future=True,
                pool_recycle=1800,   # 30 min — match PgBouncer/Neon idle timeouts
                pool_pre_ping=True,  # liveness check on checkout
            )
        return self._engine

    def connect(self):
        return self._get().connect()


engine = _LazyEngine()


def create_session():
    """Returns a new AsyncSession instance bound to the engine."""
    return AsyncSession(bind=engine._get())


AsyncSessionLocal = create_session

Base = declarative_base()


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cf_handle = Column(String(50), nullable=True)
    lc_handle = Column(String(50), nullable=True)
    primary_platform = Column(String(5), default="cf")
    last_synced = Column(TIMESTAMP, nullable=True)


class Submission(Base):
    __tablename__ = "submissions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    platform = Column(String(5), nullable=False)
    problem_id = Column(String(60), nullable=False)
    verdict = Column(String(20), nullable=True)
    topics = Column(ARRAY(Text), nullable=True)
    difficulty = Column(Integer, nullable=True)
    submitted_at = Column(TIMESTAMP, nullable=True)


class Problem(Base):
    __tablename__ = "problems"

    problem_id = Column(String(60), primary_key=True)
    platform = Column(String(5), nullable=True)
    name = Column(Text, nullable=True)
    difficulty = Column(Integer, nullable=True)
    topics = Column(ARRAY(Text), nullable=True)
    solve_count = Column(Integer, nullable=True)
    url = Column(Text, nullable=True)


class TopicGraph(Base):
    __tablename__ = "topic_graph"

    from_topic = Column(String(50), primary_key=True)
    to_topic = Column(String(50), primary_key=True)
    weight = Column(Float, default=1.0)


class KTState(Base):
    __tablename__ = "kt_states"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    topic = Column(String(50), primary_key=True)
    p_mastery = Column(Float, nullable=False, default=0.0)
    updated_at = Column(TIMESTAMP, nullable=True)


class RatingTrajectory(Base):
    __tablename__ = "rating_trajectory"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    platform = Column(String(5), default="cf")
    payload = Column(JSONB, nullable=False)
    fetched_at = Column(TIMESTAMP, nullable=True)


class MasteryHistory(Base):
    __tablename__ = "mastery_history"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    topic = Column(String(50), primary_key=True)
    checkpoint_idx = Column(Integer, primary_key=True)
    ts = Column(BigInteger, nullable=True)
    p_mastery = Column(Float, nullable=False, default=0.0)
    updated_at = Column(TIMESTAMP, nullable=True)


class ActivityWeek(Base):
    __tablename__ = "activity_weeks"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    week = Column(String(10), primary_key=True)
    solved = Column(Integer, nullable=False, default=0)
    total = Column(Integer, nullable=False, default=0)
    active_days = Column(Integer, nullable=False, default=0)
    updated_at = Column(TIMESTAMP, nullable=True)


class Plan(Base):
    __tablename__ = "plans"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(120), nullable=False)
    payload = Column(JSONB, nullable=False)
    created_at = Column(TIMESTAMP, nullable=True)
    updated_at = Column(TIMESTAMP, nullable=True)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utcnow_naive() -> datetime:
    """Naive UTC wall clock for TIMESTAMP (without time zone) columns.

    asyncpg's naive-timestamp codec cannot encode tz-aware datetimes — an
    aware value raises DataError at bind-encode time. Every writer into a
    TIMESTAMP column must use this, not datetime.now(timezone.utc).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def user_handle_condition(handle: str):
    """Single source of truth for wildcard-safe either-column handle matching.

    lower()== equality, NOT ilike() — '_' is legal in CF handles and is a LIKE
    wildcard, so ilike('a_b') would resolve to stranger 'aXb'. Shared by every
    unscoped (either-column) consumer: find_user_by_handle, delete_users_by_handle,
    and the trajectory PG cache join.
    """
    h = handle.lower()
    return (func.lower(User.cf_handle) == h) | (func.lower(User.lc_handle) == h)


async def find_user_by_handle(session, handle: str, platform: str | None = None) -> User | None:
    """Exact case-insensitive user lookup, else None.

    lower()== equality, NOT ilike() — '_' is legal in CF handles and is a
    LIKE wildcard, so ilike('a_b') would resolve to a stranger's row 'aXb'.

    Platform-scoped callers (analyze/progress/trajectory persistence) pass
    `platform` so an LC analysis can never resolve onto a stranger's CF row
    whose handle string happens to collide. Callers with no platform context
    (plans CRUD keyed by either handle) omit it and get either-column matching.

    Dual-platform users can legitimately hold TWO rows for one string
    ({cf_handle:X} + {lc_handle:X}) — the platform-scoped identity model. The
    either-column read is therefore deterministic instead of strict: prefer the
    cf-matching row (plans have historically been cf-keyed), then lowest id.
    scalar_one_or_none() would raise MultipleResultsFound and 500/[]-out every
    route for exactly those dual-platform users.
    """
    h = handle.lower()
    if platform == "cf":
        cond = func.lower(User.cf_handle) == h
        stmt = select(User).where(cond).order_by(User.id)
    elif platform == "lc":
        cond = func.lower(User.lc_handle) == h
        stmt = select(User).where(cond).order_by(User.id)
    else:
        prefer_cf = case((func.lower(User.cf_handle) == h, 0), else_=1)
        stmt = select(User).where(user_handle_condition(handle)).order_by(prefer_cf, User.id)
    return (await session.execute(stmt)).scalars().first()


async def delete_users_by_handle(session, handle: str) -> int:
    """GDPR erasure — bulk-delete EVERY user row whose cf_handle OR lc_handle
    equals `handle` (case-insensitive). Returns the number of rows deleted.

    lower()== equality, NOT ilike(): '_' is a legal CF-handle char AND a LIKE
    wildcard, so an ilike('a_b') would erase stranger 'aXb'. Deleting all
    matches (not just one) erases both halves of a dual-platform identity;
     DB-level ON DELETE CASCADE removes their children.
    """
    result = await session.execute(delete(User).where(user_handle_condition(handle)))
    return result.rowcount or 0


async def get_or_create_user(session, handle: str, platform: str = "cf") -> User:
    """find_user_by_handle() scoped to `platform`'s column, creating a row
    keyed to that platform when absent."""
    user = await find_user_by_handle(session, handle, platform)
    if not user:
        user = User(cf_handle=handle if platform == "cf" else None,
                    lc_handle=handle if platform == "lc" else None,
                    primary_platform=platform)
        session.add(user)
        await session.flush()
    return user


async def create_tables():
    """Read schema.sql and execute it against the database."""
    schema_path = Path(__file__).parent / "schema.sql"
    sql = schema_path.read_text()

    # Split on semicolons — asyncpg doesn't allow multi-statement in one exec
    statements = [s.strip() for s in sql.split(";") if s.strip()]
    async with engine.connect() as conn:
        for i, stmt in enumerate(statements):
            try:
                await conn.exec_driver_sql(stmt)
            except Exception as e:
                # Name the failing statement — a bare error hides WHICH DDL
                # aborted (and every statement after it never ran).
                head = " ".join(stmt.split())[:120]
                raise RuntimeError(f"schema.sql statement {i + 1}/{len(statements)} failed: {head} — {e}") from e
        await conn.commit()


async def get_db():
    """FastAPI dependency — yields an AsyncSession."""
    async with AsyncSessionLocal() as session:
        yield session
