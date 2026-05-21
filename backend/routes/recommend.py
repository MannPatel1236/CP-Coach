"""Recommend route — GET /api/recommend/{handle} and POST /api/recommend/{handle}"""

import logging
from typing import Optional

from fastapi import APIRouter, Query, Body
from pydantic import BaseModel

from platforms.codeforces import CFClient
from platforms.leetcode import LeetCodeClient
from platforms.normalizer import Normalizer
from data.topic_graph import CPTopicGraph
from data.preprocessor import Preprocessor
from models.recommender import Recommender

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["recommend"])


class RecommendRequest(BaseModel):
    platforms: str = "cf"
    top_k: int = 20
    focus_topics: str = ""
    mastery_scores: Optional[dict] = None
    solved_ids: list[str] = []
    user_rating: Optional[int] = None


_topic_graph = CPTopicGraph()
_normalizer = Normalizer()
_preprocessor = Preprocessor()


async def _fetch_platform_data(
    handle: str, platform_list: list[str]
) -> tuple[list, list, set, int]:
    """Fetch problems, submissions, solved IDs, and user rating from requested platforms.

    Returns (all_problems, normalized_subs, solved_ids, user_rating).
    """
    cf_client = CFClient()
    all_problems: list = []
    normalized_subs: list = []
    solved_ids: set = set()
    user_rating: int = 1200

    # Fetch CF data if needed
    if "cf" in platform_list:
        try:
            raw_subs = await cf_client.get_submissions(handle, count=1000)
            cf_subs = [_normalizer.normalize_cf_submission(s) for s in raw_subs]
            normalized_subs.extend(cf_subs)
            solved_ids.update(s["problem_id"] for s in cf_subs if s.get("verdict") == "OK")

            info = await cf_client.get_user_info(handle)
            user_rating = info.get("rating", 1200)

            cf_problems = await cf_client.get_problemset()
            all_problems.extend(cf_problems)
        except Exception as e:
            logger.warning(f"Failed to fetch CF data: {e}")

    # Fetch LC data if needed
    if "lc" in platform_list:
        try:
            lc_client = LeetCodeClient()
            lc_subs = await lc_client.get_user_submissions(handle, limit=50)
            normalized_subs.extend(lc_subs)
            solved_ids.update(s["problem_id"] for s in lc_subs if s.get("verdict") == "OK")

            ranking = await lc_client.get_contest_ranking(handle)
            if ranking and ranking.get("rating"):
                lc_rating = int(ranking["rating"])
                if "cf" not in platform_list:
                    user_rating = lc_rating

            try:
                lc_problems = await lc_client.get_all_problems(limit=500)
                for p in lc_problems:
                    all_problems.append(_normalizer.normalize_lc_problem(p))
            except Exception as e:
                logger.warning(f"Failed to fetch LC problems from API: {e}")
        except Exception as e:
            logger.warning(f"Failed to fetch LC data: {e}")

    return all_problems, normalized_subs, solved_ids, user_rating


@router.get("/recommend/{handle}")
async def recommend(
    handle: str,
    platforms: str = Query("cf"),
    top_k: int = Query(20),
    focus_topics: str = Query(""),
):
    platform_list = [p.strip() for p in platforms.split(",") if p.strip()]

    all_problems, normalized_subs, solved_ids, user_rating = await _fetch_platform_data(
        handle, platform_list
    )

    # Build topic profile from all submissions
    topic_profile = _preprocessor.build_topic_profile(normalized_subs)
    mastery_scores = {t["topic"]: t["solve_rate"] for t in topic_profile}
    for t in _topic_graph.TOPICS:
        if t not in mastery_scores:
            mastery_scores[t] = 0.0

    # Run recommender
    focus = [t.strip() for t in focus_topics.split(",") if t.strip()] if focus_topics else None
    recommender = Recommender(_topic_graph)
    recs = recommender.recommend(
        user_rating=user_rating,
        mastery_scores=mastery_scores,
        solved_problem_ids=solved_ids,
        all_problems=all_problems,
        focus_topics=focus,
        platforms=platform_list,
        top_k=top_k,
    )

    return {
        "handle": handle,
        "platforms": platform_list,
        "focus_topics": focus or [],
        "recommendations": recs,
        "model_used": "rule_based",
    }


@router.post("/recommend/{handle}")
async def recommend_post(
    handle: str,
    body: RecommendRequest = Body(...),
):
    platform_list = [p.strip() for p in body.platforms.split(",") if p.strip()]
    focus = [t.strip() for t in body.focus_topics.split(",") if t.strip()] if body.focus_topics else None

    all_problems, normalized_subs, fetched_solved_ids, fetched_user_rating = (
        await _fetch_platform_data(handle, platform_list)
    )

    # Use body-provided solved_ids when non-empty, otherwise use fetched
    if body.solved_ids:
        solved_ids = set(body.solved_ids)
    else:
        solved_ids = fetched_solved_ids

    # Use body-provided user_rating when present, otherwise use fetched
    user_rating = body.user_rating if body.user_rating is not None else fetched_user_rating

    # Use provided mastery_scores if explicitly provided and non-empty,
    # otherwise build from fetched submissions (Bug 3 fix: NOT from empty [])
    if body.mastery_scores is not None and len(body.mastery_scores) > 0:
        mastery_scores = body.mastery_scores
    else:
        topic_profile = _preprocessor.build_topic_profile(normalized_subs)
        mastery_scores = {t["topic"]: t["solve_rate"] for t in topic_profile}
        for t in _topic_graph.TOPICS:
            if t not in mastery_scores:
                mastery_scores[t] = 0.0

    recommender = Recommender(_topic_graph)
    recs = recommender.recommend(
        user_rating=user_rating,
        mastery_scores=mastery_scores,
        solved_problem_ids=solved_ids,
        all_problems=all_problems,
        focus_topics=focus,
        platforms=platform_list,
        top_k=body.top_k,
    )

    model_used = "graph_dkt" if body.mastery_scores is not None and len(body.mastery_scores) > 0 else "rule_based"

    return {
        "handle": handle,
        "platforms": platform_list,
        "focus_topics": focus or [],
        "recommendations": recs,
        "model_used": model_used,
    }
