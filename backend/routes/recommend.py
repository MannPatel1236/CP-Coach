"""Recommend route — GET /api/recommend/{handle} and POST /api/recommend/{handle}"""

import asyncio
import logging
import time

from fastapi import APIRouter, HTTPException, Query, Body, Request
from pydantic import BaseModel

from rate_limiter import limiter
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
    focus_topics: str | None = ""
    mastery_scores: dict | None = None
    solved_ids: list[str] = []
    user_rating: int | None = None


_topic_graph = CPTopicGraph()
_normalizer = Normalizer()
_preprocessor = Preprocessor()

# Module-level problemset cache (TTL = 1 hour = 3600 seconds, max 4 keys)
_CACHE_TTL = 3600
_MAX_CACHED_KEYS = 4
_problemset_cache: dict = {}
_cache_timestamps: dict = {}
_cache_locks: dict[str, asyncio.Lock] = {}


def _get_cached(key: str):
    ts = _cache_timestamps.get(key)
    if ts and (time.time() - ts) < _CACHE_TTL:
        return _problemset_cache.get(key)
    return None


def _set_cached(key: str, value):
    if len(_problemset_cache) >= _MAX_CACHED_KEYS and key not in _problemset_cache:
        oldest = min(_cache_timestamps, key=lambda k: _cache_timestamps[k])
        del _problemset_cache[oldest]
        del _cache_timestamps[oldest]
    _problemset_cache[key] = value
    _cache_timestamps[key] = time.time()


async def _get_or_fetch(key: str, fetch_fn):
    """Single-flight cache: concurrent callers await the first request."""
    cached = _get_cached(key)
    if cached is not None:
        return cached

    if key not in _cache_locks:
        _cache_locks[key] = asyncio.Lock()
    async with _cache_locks[key]:
        # Re-check after acquiring lock (another coroutine may have populated it)
        cached = _get_cached(key)
        if cached is not None:
            return cached
        result = await fetch_fn()
        _set_cached(key, result)
        return result


async def _fetch_platform_data_cached(
    handle: str, platform_list: list[str]
) -> tuple[list, list, set, int, list[str]]:
    """Fetch problems, submissions, solved IDs, user rating, and errors from requested platforms.

    Returns (all_problems, normalized_subs, solved_ids, user_rating, errors).
    """
    cf_client = CFClient()
    all_problems: list = []
    normalized_subs: list = []
    solved_ids: set = set()
    user_rating: int = 1200
    errors: list[str] = []

    # Fetch CF data if needed
    if "cf" in platform_list:
        try:
            raw_subs = await cf_client.get_submissions(handle, count=1000)
            cf_subs = [_normalizer.normalize_cf_submission(s) for s in raw_subs]
            normalized_subs.extend(cf_subs)
            solved_ids.update(s["problem_id"] for s in cf_subs if s.get("verdict") == "OK")

            info = await cf_client.get_user_info(handle)
            user_rating = info.get("rating", 1200)

            cf_problems = await _get_or_fetch("cf_problemset", cf_client.get_problemset)
            all_problems.extend(cf_problems)
        except ValueError as e:
            errors.append(f"CF validation: {e}")
        except RuntimeError as e:
            errors.append(f"CF API: {e}")

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
                lc_problems = await _get_or_fetch("lc_problemset", lambda: lc_client.get_all_problems(limit=500))
                for p in lc_problems:
                    all_problems.append(_normalizer.normalize_lc_problem(p))
            except RuntimeError as e:
                errors.append(f"LC problemset: {e}")
        except ValueError as e:
            errors.append(f"LC validation: {e}")
        except RuntimeError as e:
            errors.append(f"LC API: {e}")

    # If ALL platforms failed with validation errors, propagate as 400
    if errors and not normalized_subs and not all_problems:
        raise ValueError(errors[0])

    return all_problems, normalized_subs, solved_ids, user_rating, errors


def _run_recommender(
    handle: str,
    platform_list: list[str],
    focus_topics_str: str | None,
    top_k: int,
    all_problems: list,
    normalized_subs: list,
    fetched_solved_ids: set,
    fetched_user_rating: int,
    mastery_scores_override: dict | None,
    solved_ids_override: list[str] | None,
    user_rating_override: int | None,
    model_used: str,
    fetch_errors: list[str],
) -> dict:
    """Build mastery scores and run the recommender engine.

    Returns the full JSON response payload for both GET and POST /recommend.
    """
    # Determine final solved_ids
    if solved_ids_override:
        solved_ids = set(solved_ids_override)
    else:
        solved_ids = fetched_solved_ids

    # Determine final user_rating
    user_rating = user_rating_override if user_rating_override is not None else fetched_user_rating

    # Determine mastery scores
    if mastery_scores_override is not None and len(mastery_scores_override) > 0:
        mastery_scores = mastery_scores_override
    else:
        topic_profile = _preprocessor.build_topic_profile(normalized_subs)
        mastery_scores = {t["topic"]: t["solve_rate"] for t in topic_profile}
        for t in _topic_graph.TOPICS:
            if t not in mastery_scores:
                mastery_scores[t] = 0.0

    focus = [t.strip() for t in focus_topics_str.split(",") if t.strip()] if focus_topics_str else None

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

    response = {
        "handle": handle,
        "platforms": platform_list,
        "focus_topics": focus or [],
        "recommendations": recs,
        "model_used": model_used,
    }
    if fetch_errors:
        response["partial_success"] = True
        response["errors"] = fetch_errors
    return response


@router.get("/recommend/{handle}")
@limiter.limit("30/minute")
async def recommend(
    request: Request,
    handle: str,
    platforms: str = Query("cf"),
    top_k: int = Query(20),
    focus_topics: str = Query(""),
):
    platform_list = [p.strip() for p in platforms.split(",") if p.strip()]
    try:
        all_problems, normalized_subs, solved_ids, user_rating, fetch_errors = (
            await _fetch_platform_data_cached(handle, platform_list)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return _run_recommender(
        handle=handle,
        platform_list=platform_list,
        focus_topics_str=focus_topics,
        top_k=top_k,
        all_problems=all_problems,
        normalized_subs=normalized_subs,
        fetched_solved_ids=solved_ids,
        fetched_user_rating=user_rating,
        mastery_scores_override=None,
        solved_ids_override=None,
        user_rating_override=None,
        model_used="rule_based",
        fetch_errors=fetch_errors,
    )


@router.post("/recommend/{handle}")
@limiter.limit("30/minute")
async def recommend_post(
    request: Request,
    handle: str,
    body: RecommendRequest = Body(...),
):
    platform_list = [p.strip() for p in body.platforms.split(",") if p.strip()]

    try:
        all_problems, normalized_subs, fetched_solved_ids, fetched_user_rating, fetch_errors = (
            await _fetch_platform_data_cached(handle, platform_list)
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    model_used = "graph_dkt" if (body.mastery_scores is not None and len(body.mastery_scores) > 0) else "rule_based"

    return _run_recommender(
        handle=handle,
        platform_list=platform_list,
        focus_topics_str=body.focus_topics or "",
        top_k=body.top_k,
        all_problems=all_problems,
        normalized_subs=normalized_subs,
        fetched_solved_ids=fetched_solved_ids,
        fetched_user_rating=fetched_user_rating,
        mastery_scores_override=body.mastery_scores,
        solved_ids_override=body.solved_ids,
        user_rating_override=body.user_rating,
        model_used=model_used,
        fetch_errors=fetch_errors,
    )
