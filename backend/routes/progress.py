"""Progress route — GET /api/progress/{handle}"""

import logging
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Query

from platforms.codeforces import CFClient
from platforms.normalizer import Normalizer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["progress"])

_normalizer = Normalizer()


@router.get("/progress/{handle}")
async def progress(handle: str, platform: str = Query("cf")):
    # Fetch submissions
    client = CFClient()
    raw_subs = await client.get_all_submissions(handle, max_count=8000)
    normalized = [_normalizer.normalize_cf_submission(s) for s in raw_subs]

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
        "topic_progress": topic_progress,
    }
