"""Progress route — GET /api/progress/{handle}"""

import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request

from rate_limiter import limiter
from platforms.codeforces import CFClient
from platforms.leetcode import LeetCodeClient
from platforms.normalizer import Normalizer

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
        return [_normalizer.normalize_cf_submission(s) for s in raw_subs]


@router.get("/progress/{handle}")
@limiter.limit("30/minute")
async def progress(request: Request, handle: str, platform: str = Query("cf")):
    try:
        normalized = await _fetch_normalized_subs(handle, platform)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Group by week and topic
    topic_weeks: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(lambda: {"solved": 0, "total": 0}))

    for sub in normalized:
        ts = sub.get("timestamp", 0) / 1000
        if ts <= 0:
            continue
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        week_key = dt.strftime("%Y-W%W")

        for topic in sub.get("topics", []):
            topic_weeks[topic][week_key]["total"] += 1
            if sub.get("verdict") == "OK":
                topic_weeks[topic][week_key]["solved"] += 1

    # Build response
    topic_progress = {}
    for topic, weeks in topic_weeks.items():
        weekly = []
        for week, counts in sorted(weeks.items()):
            rate = counts["solved"] / counts["total"] if counts["total"] > 0 else 0.0
            weekly.append({"week": week, "solve_rate": round(rate, 3)})
        topic_progress[topic] = weekly

    return {
        "handle": handle,
        "platform": platform,
        "topic_progress": topic_progress,
    }
