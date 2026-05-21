"""LeetCode GraphQL API client."""

import os
import asyncio
import logging

import httpx
from fastapi import HTTPException

from platforms.normalizer import Normalizer

logger = logging.getLogger(__name__)

LC_URL = os.getenv("LC_GRAPHQL_URL", "https://leetcode.com/graphql")
HEADERS = {
    "Content-Type": "application/json",
    "Referer": "https://leetcode.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}
TIMEOUT = 20.0

# Module-level problem cache
_problem_cache: dict[str, dict] = {}


class LeetCodeClient:
    """Async client for the LeetCode GraphQL API (server-side only)."""

    def __init__(self):
        self._normalizer = Normalizer()

    # ── Internal GraphQL helper ──────────────────────────────────────

    async def _gql(self, query: str, variables: dict) -> dict:
        payload = {"query": query, "variables": variables}
        retried = False
        while True:
            try:
                async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                    resp = await client.post(LC_URL, json=payload, headers=HEADERS)
                    if resp.status_code == 429:
                        if not retried:
                            retried = True
                            logger.warning("LC rate limited, retrying in 2s …")
                            await asyncio.sleep(2)
                            continue
                    data = resp.json()
                    if "errors" in data:
                        logger.warning("LC GraphQL errors: %s", data["errors"])
                        return {}
                    return data.get("data", {})
            except httpx.HTTPError as e:
                logger.error("LC GraphQL request failed: %s", e)
                return {}

    # ── User profile ─────────────────────────────────────────────────

    async def get_user_profile(self, username: str) -> dict:
        query = """
        query getUserProfile($username: String!) {
            matchedUser(username: $username) {
                username
                submitStats {
                    acSubmissionNum { difficulty count submissions }
                }
            }
        }
        """
        data = await self._gql(query, {"username": username})
        user = data.get("matchedUser")
        if user is None:
            raise HTTPException(404, detail=f"LeetCode user '{username}' not found")

        stats = {s["difficulty"]: s["count"] for s in user["submitStats"]["acSubmissionNum"]}
        return {
            "handle": username,
            "platform": "lc",
            "rating": None,
            "total_solved": stats.get("All", 0),
            "easy_solved": stats.get("Easy", 0),
            "medium_solved": stats.get("Medium", 0),
            "hard_solved": stats.get("Hard", 0),
        }

    # ── Contest ranking ──────────────────────────────────────────────

    async def get_contest_ranking(self, username: str) -> dict | None:
        query = """
        query getUserContestRanking($username: String!) {
            userContestRanking(username: $username) {
                attendedContestsCount rating globalRanking
            }
        }
        """
        data = await self._gql(query, {"username": username})
        return data.get("userContestRanking")

    # ── Recent submissions ───────────────────────────────────────────

    async def get_recent_submissions(self, username: str, limit: int = 50) -> list[dict]:
        query = """
        query getRecentSubmissions($username: String!, $limit: Int) {
            recentSubmissionList(username: $username, limit: $limit) {
                title titleSlug timestamp statusDisplay lang
            }
        }
        """
        data = await self._gql(query, {"username": username, "limit": limit})
        return data.get("recentSubmissionList") or []

    # ── Problem details (cached) ─────────────────────────────────────

    async def get_problem_details(self, title_slug: str) -> dict:
        if title_slug in _problem_cache:
            return _problem_cache[title_slug]

        query = """
        query getProblemDetails($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                title difficulty
                topicTags { name slug }
            }
        }
        """
        data = await self._gql(query, {"titleSlug": title_slug})
        question = data.get("question") or {}
        _problem_cache[title_slug] = question
        return question

    # ── All problems (for recommendations) ───────────────────────────

    async def get_all_problems(self, limit: int = 500) -> list[dict]:
        """Fetch problemset for recommendations. Uses pagination to get up to `limit` problems."""
        all_problems = []
        skip = 0
        page_size = 100

        while len(all_problems) < limit:
            query = """
            query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
                problemsetQuestionList: questionList(
                    categorySlug: $categorySlug
                    limit: $limit
                    skip: $skip
                    filters: $filters
                ) {
                    total: totalNum
                    questions: data {
                        title titleSlug difficulty topicTags { name slug }
                    }
                }
            }
            """
            data = await self._gql(query, {"categorySlug": "", "limit": page_size, "skip": skip, "filters": {}})
            result = data.get("problemsetQuestionList") or {}
            questions = result.get("questions", [])
            if not questions:
                break
            all_problems.extend(questions)
            skip += page_size
            if len(questions) < page_size:
                break

        return all_problems[:limit]

    # ── Full submission pipeline ─────────────────────────────────────

    async def get_user_submissions(self, username: str, limit: int = 50) -> list[dict]:
        raw_subs = await self.get_recent_submissions(username, limit)
        if not raw_subs:
            return []

        # Collect unique slugs
        unique_slugs = list(dict.fromkeys(s["titleSlug"] for s in raw_subs))

        # Fetch problem details with rate-limit delay
        for slug in unique_slugs:
            if slug not in _problem_cache:
                await self.get_problem_details(slug)
                await asyncio.sleep(0.1)

        # Merge and normalize
        normalized = []
        for sub in raw_subs:
            details = _problem_cache.get(sub["titleSlug"], {})
            merged = {
                "titleSlug": sub["titleSlug"],
                "statusDisplay": sub["statusDisplay"],
                "timestamp": sub["timestamp"],
                "difficulty": details.get("difficulty"),
                "topicTags": details.get("topicTags", []),
            }
            normalized.append(self._normalizer.normalize_lc_submission(merged))
        return normalized
