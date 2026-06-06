"""SQLAlchemy async engine + ORM models."""

import logging
import os
from pathlib import Path

from sqlalchemy import (
    Column, Integer, String, Float, BigInteger, ForeignKey, TIMESTAMP, ARRAY, Text,
)
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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
