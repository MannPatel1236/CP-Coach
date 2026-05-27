"""Codeforces REST API client."""

import os
import re
import asyncio
import logging

import httpx

from platforms.normalizer import Normalizer

logger = logging.getLogger(__name__)

CF_BASE = os.getenv("CF_API_BASE", "https://codeforces.com/api")
TIMEOUT = 15.0
PAGE_SIZE = 1000
PAGE_DELAY = 0.3

_MAX_HANDLE_LENGTH = 40
_HANDLE_PATTERN = re.compile(r"^[a-zA-Z0-9_\\-]+$")


class HandleError(ValueError):
    """Raised for invalid Codeforces handles."""

def _validate_handle(handle: str) -> None:
    if not handle or not isinstance(handle, str):
        raise HandleError("Handle is required.")
    if not handle.strip():
        raise HandleError("Handle cannot be blank.")
    if len(handle) > _MAX_HANDLE_LENGTH:
        raise HandleError("Handle too long.")
    if not _HANDLE_PATTERN.match(handle):
        raise HandleError("Invalid characters in handle.")


_shared_client = httpx.AsyncClient(
    timeout=TIMEOUT,
    limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
)


class CFClient:
    """Async client for the public Codeforces API."""

    def __init__(self):
        self._normalizer = Normalizer()

    # ── User info ────────────────────────────────────────────────────

    async def get_user_info(self, handle: str) -> dict:
        _validate_handle(handle)
        data = await self._get(f"/user.info?handles={handle}")
        if data.get("status") != "OK":
            raise HandleError(f"CF handle '{handle}' not found")
        return data["result"][0]

    # ── Submissions ──────────────────────────────────────────────────

    async def get_submissions(self, handle: str, count: int = 1000, offset: int = 1) -> list[dict]:
        _validate_handle(handle)
        data = await self._get(f"/user.status?handle={handle}&count={count}&from={offset}")
        if data.get("status") != "OK":
            raise RuntimeError("Could not fetch CF submissions")
        return data["result"]

    async def get_all_submissions(self, handle: str, max_count: int = 8000) -> list[dict]:
        all_subs = []
        offset = 1
        while len(all_subs) < max_count:
            page = await self.get_submissions(handle, count=PAGE_SIZE, offset=offset)
            all_subs.extend(page)
            if len(page) < PAGE_SIZE:
                break
            offset += PAGE_SIZE
            await asyncio.sleep(PAGE_DELAY)
        return all_subs[:max_count]

    # ── Problemset ───────────────────────────────────────────────────

    async def get_problemset(self) -> list[dict]:
        data = await self._get("/problemset.problems")
        if data.get("status") != "OK":
            raise RuntimeError("Could not fetch CF problemset")

        problems = data["result"]["problems"]
        stats = data["result"]["problemStatistics"]

        # Build stat lookup by (contestId, index)
        stat_map = {}
        for s in stats:
            key = (s.get("contestId"), s.get("index"))
            stat_map[key] = s

        normalized = []
        for p in problems:
            key = (p.get("contestId"), p.get("index"))
            stat = stat_map.get(key, {})
            normalized.append(self._normalizer.normalize_cf_problem(p, stat))
        return normalized

    # ── Internal HTTP ────────────────────────────────────────────────

    async def _get(self, path: str) -> dict:
        url = f"{CF_BASE}{path}"
        retried = False
        while True:
            try:
                resp = await _shared_client.get(url)
                resp.raise_for_status()
                return resp.json()
            except httpx.TimeoutException:
                if not retried:
                    retried = True
                    logger.warning("CF API timeout, retrying in 1s …")
                    await asyncio.sleep(1)
                    continue
                raise RuntimeError("CF API timed out")
            except httpx.HTTPStatusError as e:
                if e.response.status_code >= 500 and not retried:
                    retried = True
                    logger.warning("CF server error %s, retrying in 2s ...", e.response.status_code)
                    await asyncio.sleep(2)
                    continue
                raise RuntimeError(f"Could not reach CF API ({e.response.status_code})")
            except httpx.HTTPError as e:
                logger.error("CF request failed: %s", e)
                raise RuntimeError("CF API unavailable")
