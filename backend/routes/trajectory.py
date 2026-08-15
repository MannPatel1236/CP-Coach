"""Rating trajectory route — GET /api/rating-trajectory/{handle} (Greenhouse Phase 4a).

CF-only data source (user.rating). LeetCode handles return points=null — never a
404 (spec §7 item 1: the frontend renders a disabled card with a caption).
Cache tiers: in-memory TTL dict (primary) → Postgres rating_trajectory row
(restart-persistent second tier) → live CF fetch + upsert. All CF traffic stays
inside CFClient (SSRF guard + retry/backoff). Postgres failures are non-fatal —
the route degrades to memory + live fetch, never 502s on cache I/O.
"""

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from auth import verify_hmac, verify_handle_signature
from rate_limiter import limiter
from platforms.codeforces import CFClient
from db.connection import AsyncSessionLocal, User, RatingTrajectory
from routes.schemas import RatingPoint, RatingTrajectoryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["trajectory"])

_CACHE_TTL = 3600  # 1 hour — stay well under the CF 5 req/s budget
_MAX_CACHED_KEYS = 32
_cache: dict[str, tuple[float, list[RatingPoint]]] = {}


def _get_cached(key: str):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _set_cached(key: str, value: list[RatingPoint]):
    if len(_cache) >= _MAX_CACHED_KEYS and key not in _cache:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        del _cache[oldest]
    _cache[key] = (time.time(), value)


def _validate_points(payload: list[dict]) -> list[RatingPoint]:
    return [RatingPoint.model_validate(p) for p in payload]


async def _load_pg_cache(handle: str) -> list[RatingPoint] | None:
    """Second-tier cache: Postgres row with fetched_at TTL check. None on any failure."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(RatingTrajectory).join(User, User.id == RatingTrajectory.user_id).where(
                User.cf_handle.ilike(handle)
            )
            row = (await session.execute(stmt)).scalars().first()
            if row is None or row.fetched_at is None:
                return None
            fetched = row.fetched_at.replace(tzinfo=None)
            if (time.time() - fetched.timestamp()) >= _CACHE_TTL:
                return None
            return _validate_points(row.payload)  # pyright: ignore[reportArgumentType]
    except Exception as e:
        logger.warning("RatingTrajectory Postgres cache read failed: %s", e)
        return None


async def _save_pg_cache(handle: str, payload: list[RatingPoint]):
    """Upsert the per-handle trajectory row (non-fatal on failure)."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.cf_handle.ilike(handle))
            user = (await session.execute(stmt)).scalar_one_or_none()
            if user is None:
                user = User(cf_handle=handle, primary_platform="cf")
                session.add(user)
                await session.flush()
            stmt = pg_insert(RatingTrajectory).values(
                user_id=user.id, platform="cf", payload=[p.model_dump() for p in payload],
                fetched_at=datetime.now(timezone.utc),
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id"],
                set_={"platform": stmt.excluded.platform, "payload": stmt.excluded.payload,
                      "fetched_at": stmt.excluded.fetched_at},
            )
            await session.execute(stmt)
            await session.commit()
    except Exception as e:
        logger.warning("RatingTrajectory Postgres cache write failed: %s", e)


def _to_points(result: list[dict]) -> list[RatingPoint]:
    return [
        RatingPoint(
            contest_id=r.get("contestId"),
            contest_name=r.get("contestName", ""),
            rank=r.get("rank"),
            old_rating=r.get("oldRating"),
            new_rating=r.get("newRating"),
            timestamp=r.get("ratingUpdateTimeSeconds", 0),
        )
        for r in result
    ]


@router.get("/rating-trajectory/{handle}", response_model=RatingTrajectoryResponse)
@limiter.limit("30/minute")
async def rating_trajectory(
    request: Request,
    handle: str,
    platform: str = Query("cf"),
    _auth: None = Depends(verify_hmac),
):
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    if platform == "lc":
        # Spec §5.2: LeetCode handles get a disabled-card response, never a 404.
        return RatingTrajectoryResponse(handle=handle, platform="lc", points=None)

    key = f"cf:{handle.lower()}"
    cached = _get_cached(key)
    if cached is not None:
        return RatingTrajectoryResponse(handle=handle, platform="cf", points=cached)

    cached = await _load_pg_cache(handle)
    if cached is not None:
        _set_cached(key, cached)
        return RatingTrajectoryResponse(handle=handle, platform="cf", points=cached)

    try:
        client = CFClient()
        result = await client.get_rating_history(handle)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    points = _to_points(result)
    _set_cached(key, points)
    await _save_pg_cache(handle, points)
    return RatingTrajectoryResponse(handle=handle, platform="cf", points=points)