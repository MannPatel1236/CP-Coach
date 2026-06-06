"""Analyze route — GET /api/analyze/{handle}"""

import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from auth import verify_hmac
from rate_limiter import limiter
from platforms.codeforces import CFClient
from platforms.leetcode import LeetCodeClient
from platforms.normalizer import Normalizer
from data.preprocessor import Preprocessor
from data.topic_graph import CPTopicGraph
from db.connection import AsyncSessionLocal, User, KTState
from routes.schemas import AnalyzeResponse, TopicProfileEntry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["analyze"])

_topic_graph = CPTopicGraph()
_normalizer = Normalizer()
_preprocessor = Preprocessor()


async def _analyze_cf(handle: str, mode: str, _controller):
    """Analyze a Codeforces user. Returns (profile_dict, normalized_subs, easy_solved)."""
    client = CFClient()
    raw_info = await client.get_user_info(handle)
    user_rating = raw_info.get("rating")
    profile = {
        "handle": handle,
        "platform": "cf",
        "rating": user_rating,
        "rank": raw_info.get("rank"),
        "maxRating": raw_info.get("maxRating"),
        "maxRank": raw_info.get("maxRank"),
        "avatar": raw_info.get("avatar"),
        "titlePhoto": raw_info.get("titlePhoto"),
        "country": raw_info.get("country"),
        "organization": raw_info.get("organization"),
        "city": raw_info.get("city"),
    }

    count = 1000 if mode == "quick" else 8000
    if mode == "deep":
        raw_subs = await client.get_all_submissions(handle, max_count=count)
    else:
        raw_subs = await client.get_submissions(handle, count=count)
    normalized_subs = [_normalizer.normalize_cf_submission(s) for s in raw_subs]

    return profile, normalized_subs, None


async def _analyze_lc(handle: str, mode: str, _controller):
    """Analyze a LeetCode user. Returns (profile_dict, normalized_subs, easy_solved|None).

    If LC submissions are private but stats exist, returns a special 'stats_only' result.
    """
    client = LeetCodeClient()
    profile = await client.get_user_profile(handle)
    user_rating = None
    easy_solved = profile.get("easy_solved", 0)
    medium_solved = profile.get("medium_solved", 0)
    hard_solved = profile.get("hard_solved", 0)

    ranking = await client.get_contest_ranking(handle)
    if ranking and ranking.get("rating"):
        user_rating = int(ranking["rating"])
        profile["rating"] = user_rating

    raw_subs = await client.get_user_submissions(handle, limit=50)
    normalized_subs = raw_subs  # Already normalized by LeetCodeClient

    # No public submissions but stats exist → return difficulty breakdown only
    if len(normalized_subs) == 0 and (easy_solved or medium_solved or hard_solved):
        total_solved = (easy_solved or 0) + (medium_solved or 0) + (hard_solved or 0)
        return {
            "handle": handle,
            "platform": "lc",
            "rating": user_rating,
            "easy_solved": easy_solved,
            "medium_solved": medium_solved,
            "hard_solved": hard_solved,
            "topic_profile": [],
            "weak_areas": [],
            "mastery_scores": {},
            "model_used": "stats_only",
            "total_submissions": total_solved,
            "note": "LeetCode submissions are private. Showing difficulty breakdown only.",
        }, None, None

    return profile, normalized_subs, easy_solved


def _compute_mastery(sequence, normalized_subs, preloaded_model=None):
    """Compute mastery scores — try Graph-DKT, fallback to rule-based."""
    model_used = "rule_based"
    mastery_scores = {t["topic"]: t["solve_rate"] for t in _preprocessor.build_topic_profile(normalized_subs)}

    model = preloaded_model
    if model is None:
        # Fallback: try loading from disk (for standalone usage)
        weights_path = os.getenv("MODEL_WEIGHTS_PATH", "./weights/graph_dkt.pt")
        if os.path.exists(weights_path):
            try:
                from models.graph_dkt import GraphDKTModel
                model = GraphDKTModel.load(weights_path, topic_graph=_topic_graph)
            except Exception as e:
                logger.warning("Failed to load Graph-DKT model: %s", e)

    if model is not None and sequence:
        try:
            mastery_scores = model.predict_mastery(sequence, _topic_graph)
            model_used = "graph_dkt"
        except Exception as e:
            logger.warning("Graph-DKT prediction failed: %s", e)

    for t in _topic_graph.TOPICS:
        if t not in mastery_scores:
            mastery_scores[t] = 0.0

    # Keep only canonical 29 topics — non-canonical CF tags (e.g. "*special")
    # can leak in from rule-based fallback and should not be exposed or persisted.
    canonical = set(_topic_graph.TOPICS)
    mastery_scores = {k: v for k, v in mastery_scores.items() if k in canonical}

    return mastery_scores, model_used


async def _persist_kt_states(handle: str, platform: str, mastery_scores: dict[str, float]):
    """Upsert mastery scores for a user into kt_states table."""
    async with AsyncSessionLocal() as session:
        # Map platform to the correct handle column
        handle_col = User.cf_handle if platform == "cf" else User.lc_handle

        # Find or create user
        stmt = select(User).where(handle_col.ilike(handle))
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            user = User(cf_handle=handle if platform == "cf" else None,
                        lc_handle=handle if platform == "lc" else None,
                        primary_platform=platform)
            session.add(user)
            await session.flush()  # get the ID

        now = datetime.now(timezone.utc)
        stmt = pg_insert(KTState).values([
            {"user_id": user.id, "topic": t, "p_mastery": s, "updated_at": now}
            for t, s in mastery_scores.items()
        ])
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id", "topic"],
            set_={"p_mastery": stmt.excluded.p_mastery, "updated_at": stmt.excluded.updated_at},
        )
        await session.execute(stmt)
        await session.commit()


@router.get("/analyze/{handle}", response_model=AnalyzeResponse)
@limiter.limit("30/minute")
async def analyze(request: Request, handle: str, platform: str = Query("cf"), mode: str = Query("quick"), _auth: None = Depends(verify_hmac)):
    try:
        # 1. Fetch profile + submissions via platform-specific helper
        if platform == "lc":
            result = await _analyze_lc(handle, mode, None)
            if result[0] is None or (isinstance(result[0], dict) and result[0].get("model_used") == "stats_only"):
                return AnalyzeResponse(**result[0])
            profile, normalized_subs, easy_solved = result
        else:
            profile, normalized_subs, easy_solved = await _analyze_cf(handle, mode, None)

        # 2. Build sequence + topic profile
        subs = normalized_subs or []
        sequence = _preprocessor.build_submission_sequence(subs)
        raw_profile = _preprocessor.build_topic_profile(subs)
        topic_profile = [TopicProfileEntry.model_validate(t) for t in raw_profile]
        weak_areas = _preprocessor.detect_weak_areas(raw_profile)

        # 3. Mastery scores (use pre-loaded model from startup)
        preloaded = getattr(request.app.state, "graph_dkt_model", None)
        mastery_scores, model_used = _compute_mastery(sequence, normalized_subs, preloaded_model=preloaded)

        user_rating = profile.get("rating") if isinstance(profile, dict) else None

        # 4. Persist mastery scores to kt_states (non-blocking — log failures only)
        try:
            await _persist_kt_states(handle, platform, mastery_scores)
        except Exception as e:
            logger.warning("Failed to persist kt_states for %s: %s", handle, e)

        return AnalyzeResponse(
            handle=handle,
            platform=platform,
            rating=user_rating,
            rank=profile.get("rank") if platform == "cf" else None,
            maxRating=profile.get("maxRating") if platform == "cf" else None,
            maxRank=profile.get("maxRank") if platform == "cf" else None,
            avatar=profile.get("avatar") if platform == "cf" else None,
            country=profile.get("country") if platform == "cf" else None,
            organization=profile.get("organization") if platform == "cf" else None,
            easy_solved=easy_solved,
            medium_solved=profile.get("medium_solved") if platform == "lc" else None,
            hard_solved=profile.get("hard_solved") if platform == "lc" else None,
            topic_profile=topic_profile,
            weak_areas=weak_areas,
            mastery_scores=mastery_scores,
            model_used=model_used,
            total_submissions=len(subs),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
