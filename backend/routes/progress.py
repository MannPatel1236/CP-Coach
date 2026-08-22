"""Progress route — GET /api/progress/{handle} (per-week activity buckets, Phase 4c)"""

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from auth import verify_hmac, verify_handle_signature
from rate_limiter import limiter
from platforms.codeforces import CFClient
from platforms.leetcode import LeetCodeClient
from platforms.normalizer import Normalizer
from db.connection import AsyncSessionLocal, User, ActivityWeek
from routes.schemas import ProgressResponse, WeeklyEntry, ActivityWeek as ActivityWeekSchema

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["progress"])

_normalizer = Normalizer()


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
            handle_col = User.cf_handle if platform == "cf" else User.lc_handle
            stmt = select(User).where(handle_col.ilike(handle))
            user = (await session.execute(stmt)).scalar_one_or_none()
            if not user:
                user = User(cf_handle=handle if platform == "cf" else None,
                            lc_handle=handle if platform == "lc" else None,
                            primary_platform=platform)
                session.add(user)
                await session.flush()

            now = datetime.now(timezone.utc)
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
        week_key = dt.strftime("%Y-W%W")

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

    # Zero-fill from the first bucket through the CURRENT week. Without this, a
    # stale last-active week stays the newest key and the heatmap's current-streak
    # logic (breaks on inactive latest week) never sees weeks of inactivity.
    stamps = [s.get("timestamp", 0) / 1000 for s in normalized if s.get("timestamp", 0) > 0]
    if stamps:
        cursor = datetime.fromtimestamp(min(stamps), tz=timezone.utc)
        end = datetime.now(timezone.utc)
        while cursor <= end:
            week_key = cursor.strftime("%Y-W%W")
            if week_key not in activity:
                activity[week_key] = {"solved": 0, "total": 0, "active_days": 0}
            cursor += timedelta(days=7)

    # Persist activity buckets (non-blocking)
    try:
        await _persist_activity_weeks(handle, platform, dict(activity))
    except Exception as e:
        logger.warning("Failed to persist activity_weeks for %s: %s", handle, e)

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

    return ProgressResponse(
        handle=handle,
        platform=platform,
        topic_progress=topic_progress,
        activity=activity_response,
    )
