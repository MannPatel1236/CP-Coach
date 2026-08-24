"""Mastery-history route — GET /api/mastery-history/{handle}

Greenhouse Phase 4b read side: O(read) snapshot of the checkpoints persisted
by the analyze pass (routes/analyze.py::_persist_mastery_history) — never a
model rollout (spec §7 item 2). Empty snapshot → mastery_history: null + note
(never an error; the frontend renders a caption per spec §5.2 #6).
"""

import logging

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select

from auth import verify_hmac, verify_handle_signature
from rate_limiter import limiter
from db.connection import (
    AsyncSessionLocal, MasteryHistory, find_user_by_handle,
)
from routes.schemas import MasteryHistoryResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["mastery-history"])


async def _read_mastery_history(handle: str, platform: str) -> dict | None:
    """O(read) snapshot read — never a model rollout (spec §7 item 2)."""
    async with AsyncSessionLocal() as session:
        user = await find_user_by_handle(session, handle, platform)
        if not user:
            return None
        rows = (await session.execute(
            select(MasteryHistory).where(MasteryHistory.user_id == user.id)
        )).scalars().all()
        if len(rows) == 0:  # pyright: ignore[reportGeneralTypeIssues]
            return None
        history = {}
        for r in sorted(rows, key=lambda r: (r.topic, r.checkpoint_idx)):
            history.setdefault(r.topic, []).append({"ts": r.ts or 0, "p": r.p_mastery})  # pyright: ignore[reportGeneralTypeIssues]
        return history


@router.get("/mastery-history/{handle}", response_model=MasteryHistoryResponse)
@limiter.limit("30/minute")
async def mastery_history(
    request: Request,
    handle: str,
    platform: str = Query("cf"),
    _auth: None = Depends(verify_hmac),
):
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        history = await _read_mastery_history(handle, platform)
        if history is None:
            return MasteryHistoryResponse(
                handle=handle, platform=platform, mastery_history=None,
                note="No mastery history yet — run a deep analyze while Graph-DKT is loaded.",
            )
        return MasteryHistoryResponse(handle=handle, platform=platform, mastery_history=history)
    except Exception as e:
        logger.warning("Mastery history read failed for %s: %s", handle, e)
        return MasteryHistoryResponse(
            handle=handle, platform=platform, mastery_history=None,
            note="Mastery history is temporarily unavailable.",
        )
