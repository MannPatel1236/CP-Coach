"""SQLAlchemy async engine + ORM models."""

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import (
    Column, Integer, String, Float, BigInteger, ForeignKey, TIMESTAMP, ARRAY, Text,
    func, select,
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


async def find_user_by_handle(session, handle: str) -> User | None:
    """Exact case-insensitive match on cf_handle OR lc_handle, else None.

    lower()== equality, NOT ilike() — '_' is legal in CF handles and is a
    LIKE wildcard, so ilike('a_b') would resolve to a stranger's row 'aXb'.
    """
    stmt = select(User).where(
        (func.lower(User.cf_handle) == handle.lower())
        | (func.lower(User.lc_handle) == handle.lower())
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_or_create_user(session, handle: str, platform: str = "cf") -> User:
    """find_user_by_handle(), creating a row keyed to `platform` when absent."""
    user = await find_user_by_handle(session, handle)
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
        for stmt in statements:
            await conn.exec_driver_sql(stmt)
        await conn.commit()


async def get_db():
    """FastAPI dependency — yields an AsyncSession."""
    async with AsyncSessionLocal() as session:
        yield session
