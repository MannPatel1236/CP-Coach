"""Progress route — GET /api/progress/{handle} (per-week activity buckets, Phase 4c)"""

import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.dialects.postgresql import insert as pg_insert

from auth import verify_hmac, verify_handle_signature
from rate_limiter import limiter
from platforms.codeforces import CFClient
from platforms.leetcode import LeetCodeClient
from platforms.normalizer import Normalizer
from db.connection import AsyncSessionLocal, ActivityWeek, get_or_create_user, utcnow_naive
from routes.schemas import ProgressResponse, WeeklyEntry, ActivityWeek as ActivityWeekSchema

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["progress"])

_normalizer = Normalizer()


def _iso_week_key(dt: datetime) -> str:
    """ISO-8601 week key 'YYYY-Www' — year-aware Mon–Sun weeks.

    strftime('%Y-W%W') splits one real week across New Year ('2025-W52' /
    '2026-W00' are the SAME calendar week) and emits partial W00 buckets;
    isocalendar() keys keep every bucket a true Mon–Sun week and sort
    chronologically as strings.
    """
    iso = dt.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


# Two-tier cache mirroring routes/trajectory.py: an in-memory TTL tier in front
# of the ≤8000-submission CF fetch + PG upsert each call would otherwise do.
# Activity heatmaps move slowly — 10-minute staleness is invisible there, and
# it keeps us far under the CF ~5 req/s budget when a dashboard tab remounts.
_PROGRESS_TTL = 600  # seconds
_MAX_PROGRESS_KEYS = 32
_progress_cache: dict[str, tuple[float, dict, dict]] = {}


def _get_progress_cached(key: str):
    entry = _progress_cache.get(key)
    if entry and (time.time() - entry[0]) < _PROGRESS_TTL:
        return entry[1], entry[2]
    return None


def _set_progress_cached(key: str, activity_response: dict, topic_progress: dict):
    if len(_progress_cache) >= _MAX_PROGRESS_KEYS and key not in _progress_cache:
        oldest = min(_progress_cache, key=lambda k: _progress_cache[k][0])
        del _progress_cache[oldest]
    _progress_cache[key] = (time.time(), activity_response, topic_progress)


async def _fetch_normalized_subs(handle: str, platform: str) -> list[dict]:
    """Fetch normalized submissions for the given platform."""
    if platform == "lc":
        client = LeetCodeClient()
        return await client.get_user_submissions(handle, limit=50)
    else:
        client = CFClient()
        raw_subs = await client.get_all_submissions(handle, max_count=8000)
        return [n for n in (_normalizer.normalize_cf_submission(s) for s in raw_subs) if n]


async def _persist_activity_weeks(handle: str, platform: str, activity: dict[str, dict]):
    """Upsert per-week activity buckets keyed (user, week). Non-blocking — log failures only."""
    try:
        async with AsyncSessionLocal() as session:
            user = await get_or_create_user(session, handle, platform)

            now = utcnow_naive()
            rows = [
                {"user_id": user.id, "week": week, "solved": a["solved"], "total": a["total"],
                 "active_days": a["active_days"], "updated_at": now}
                for week, a in activity.items()
            ]
            if not rows:
                return
            stmt = pg_insert(ActivityWeek).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "week"],
                set_={"solved": stmt.excluded.solved, "total": stmt.excluded.total,
                      "active_days": stmt.excluded.active_days, "updated_at": stmt.excluded.updated_at},
            )
            await session.execute(stmt)
            await session.commit()
    except Exception as e:
        logger.warning("Failed to persist activity_weeks for %s: %s", handle, e)


@router.get("/progress/{handle}", response_model=ProgressResponse)
@limiter.limit("30/minute")
async def progress(request: Request, handle: str, platform: str = Query("cf"), _auth: None = Depends(verify_hmac)):
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )

    cache_key = f"{platform}:{handle.lower()}"
    cached = _get_progress_cached(cache_key)
    if cached is not None:
        activity_response, topic_progress = cached
        return ProgressResponse(
            handle=handle,
            platform=platform,
            topic_progress=topic_progress,
            activity=activity_response,
        )

    try:
        normalized = await _fetch_normalized_subs(handle, platform)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Group by week and topic
    topic_weeks: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"solved": 0, "total": 0}))
    # Phase 4c — per-week activity buckets (heatmap + streak derivation §5.2 #7)
    activity: dict[str, dict] = defaultdict(lambda: {"solved": 0, "total": 0, "active_days": 0})
    active_day_keys: dict[str, set] = defaultdict(set)

    for sub in normalized:
        ts = sub.get("timestamp", 0) / 1000
        if ts <= 0:
            continue
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        week_key = _iso_week_key(dt)

        activity[week_key]["total"] += 1
        if sub.get("verdict") == "OK":
            activity[week_key]["solved"] += 1
        active_day_keys[week_key].add(dt.date().isoformat())

        for topic in sub.get("topics", []):
            topic_weeks[topic][week_key]["total"] += 1
            if sub.get("verdict") == "OK":
                topic_weeks[topic][week_key]["solved"] += 1

    for week_key, days in active_day_keys.items():
        activity[week_key]["active_days"] = len(days)

    # Zero-fill through the CURRENT week, bounded to the heatmap window (+4w
    # margin). Without the fill, a stale last-active week stays the newest key
    # and the heatmap's current-streak logic (breaks on inactive latest week)
    # never sees weeks of inactivity; without the bound, every GET writes empty
    # rows back to the user's first-ever submission.
    stamps = [s.get("timestamp", 0) / 1000 for s in normalized if s.get("timestamp", 0) > 0]
    if stamps:
        end = datetime.now(timezone.utc)
        cursor = max(datetime.fromtimestamp(min(stamps), tz=timezone.utc), end - timedelta(weeks=16))
        while cursor <= end:
            week_key = _iso_week_key(cursor)
            if week_key not in activity:
                activity[week_key] = {"solved": 0, "total": 0, "active_days": 0}
            cursor += timedelta(days=7)

    # Persist activity buckets (function logs + swallows its own failures)
    await _persist_activity_weeks(handle, platform, dict(activity))

    # Build response
    topic_progress = {}
    for topic, weeks in topic_weeks.items():
        weekly = []
        for week, counts in sorted(weeks.items()):
            rate = counts["solved"] / counts["total"] if counts["total"] > 0 else 0.0
            weekly.append(WeeklyEntry(week=week, solve_rate=round(rate, 3)))
        topic_progress[topic] = weekly

    activity_response = {
        week: ActivityWeekSchema.model_validate(a)
        for week, a in sorted(activity.items())
    }

    response = ProgressResponse(
        handle=handle,
        platform=platform,
        topic_progress=topic_progress,
        activity=activity_response,
    )
    _set_progress_cached(cache_key, activity_response, topic_progress)
    return response
