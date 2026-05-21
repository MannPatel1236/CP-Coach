"""Analyze route — GET /api/analyze/{handle}"""

import os
import logging

from fastapi import APIRouter, Query

from platforms.codeforces import CFClient
from platforms.leetcode import LeetCodeClient
from platforms.normalizer import Normalizer
from data.preprocessor import Preprocessor
from data.topic_graph import CPTopicGraph

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["analyze"])

_topic_graph = CPTopicGraph()
_normalizer = Normalizer()
_preprocessor = Preprocessor()


@router.get("/analyze/{handle}")
async def analyze(handle: str, platform: str = Query("cf"), mode: str = Query("quick")):
    # 1. Choose client + fetch profile
    if platform == "lc":
        client = LeetCodeClient()
        profile = await client.get_user_profile(handle)
        user_rating = None
        easy_solved = profile.get("easy_solved", 0)
        medium_solved = profile.get("medium_solved", 0)
        hard_solved = profile.get("hard_solved", 0)
        
        # Try to get contest rating
        ranking = await client.get_contest_ranking(handle)
        if ranking and ranking.get("rating"):
            user_rating = int(ranking["rating"])
            profile["rating"] = user_rating
    else:
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
        easy_solved = medium_solved = hard_solved = None

    # 2. Fetch submissions
    if platform == "lc":
        limit = 50  # LC only supports recent submissions
        raw_subs = await client.get_user_submissions(handle, limit=limit)
        normalized_subs = raw_subs  # Already normalized by LeetCodeClient
        
        # If no public submissions but user has solve stats, return difficulty breakdown only
        if len(normalized_subs) == 0 and (easy_solved or medium_solved or hard_solved):
            total_solved = (easy_solved or 0) + (medium_solved or 0) + (hard_solved or 0)
            
            return {
                "handle": handle,
                "platform": platform,
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
            }
    else:
        count = 1000 if mode == "quick" else 8000
        if mode == "deep":
            raw_subs = await client.get_all_submissions(handle, max_count=count)
        else:
            raw_subs = await client.get_submissions(handle, count=count)
        normalized_subs = [_normalizer.normalize_cf_submission(s) for s in raw_subs]

    # 3. Build sequence + profile
    sequence = _preprocessor.build_submission_sequence(normalized_subs)
    topic_profile = _preprocessor.build_topic_profile(normalized_subs)
    weak_areas = _preprocessor.detect_weak_areas(topic_profile)

    # 4. Mastery scores — try Graph-DKT, fallback to rule-based
    model_used = "rule_based"
    mastery_scores = {t["topic"]: t["solve_rate"] for t in topic_profile}

    weights_path = os.getenv("MODEL_WEIGHTS_PATH", "./weights/graph_dkt.pt")
    if os.path.exists(weights_path):
        try:
            from models.graph_dkt import GraphDKTModel
            model = GraphDKTModel.load(weights_path, topic_graph=_topic_graph)
            if model is not None and sequence:
                mastery_scores = model.predict_mastery(sequence, _topic_graph)
                model_used = "graph_dkt"
        except Exception as e:
            logger.warning("Failed to load Graph-DKT model: %s", e)

    # Fill missing topics with 0
    for t in _topic_graph.TOPICS:
        if t not in mastery_scores:
            mastery_scores[t] = 0.0

    return {
        "handle": handle,
        "platform": platform,
        "rating": user_rating,
        "rank": profile.get("rank") if platform == "cf" else None,
        "maxRating": profile.get("maxRating") if platform == "cf" else None,
        "maxRank": profile.get("maxRank") if platform == "cf" else None,
        "avatar": profile.get("avatar") if platform == "cf" else None,
        "country": profile.get("country") if platform == "cf" else None,
        "organization": profile.get("organization") if platform == "cf" else None,
        "easy_solved": easy_solved,
        "medium_solved": medium_solved,
        "hard_solved": hard_solved,
        "topic_profile": topic_profile,
        "weak_areas": weak_areas,
        "mastery_scores": mastery_scores,
        "model_used": model_used,
        "total_submissions": len(normalized_subs),
    }
