"""Plans route — GET/POST /api/plans/{handle}, PUT/DELETE /api/plans/{handle}/{id}

Greenhouse Phase 5b — the only DB change in the whole program (spec §7). Saved
Workbook checklists, handle-keyed (no account system, §13 #4). Writes are open
(no HMAC — the frontend cannot sign; auth is a future spec), matching the
analyze/recommend surface. Read-side DB failure → [] (frontend falls back to
localStorage, spec §5.2 #9); write-side failure → 502 (frontend keeps the
optimistic localStorage copy + toast, never silently loses data).
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from auth import verify_handle_signature
from rate_limiter import limiter
from db.connection import AsyncSessionLocal, User, Plan
from routes.schemas import PlanIn, PlanOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["plans"])


async def _resolve_or_create_user(session, handle: str) -> int:
    """Find the user row by CF or LC handle (case-insensitive), else create it."""
    stmt = select(User).where(
        (User.cf_handle.ilike(handle)) | (User.lc_handle.ilike(handle))
    )
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        user = User(cf_handle=handle, lc_handle=None, primary_platform="cf")
        session.add(user)
        await session.flush()
    return user.id  # pyright: ignore[reportReturnType]


async def _find_user(session, handle: str):
    """Find the user row by CF or LC handle (case-insensitive), else None."""
    stmt = select(User).where(
        (User.cf_handle.ilike(handle)) | (User.lc_handle.ilike(handle))
    )
    return (await session.execute(stmt)).scalar_one_or_none()


def _plan_out(p: Plan) -> PlanOut:
    return PlanOut(
        id=p.id,  # pyright: ignore[reportArgumentType]
        name=p.name,  # pyright: ignore[reportArgumentType]
        payload=p.payload or {},  # pyright: ignore[reportArgumentType, reportGeneralTypeIssues]
        created_at=p.created_at.isoformat() if p.created_at else None,  # pyright: ignore[reportGeneralTypeIssues]
        updated_at=p.updated_at.isoformat() if p.updated_at else None,  # pyright: ignore[reportGeneralTypeIssues]
    )


@router.get("/plans/{handle}", response_model=list[PlanOut])
@limiter.limit("30/minute")
async def list_plans(
    request: Request,
    handle: str,
):
    """List saved plans newest-first. No user / DB failure → [] (never an error)."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(
                (User.cf_handle.ilike(handle)) | (User.lc_handle.ilike(handle))
            )
            user = (await session.execute(stmt)).scalar_one_or_none()
            if not user:
                return []
            plans = (await session.execute(
                select(Plan).where(Plan.user_id == user.id).order_by(Plan.updated_at.desc())
            )).scalars().all()
            return [_plan_out(p) for p in plans]
    except SQLAlchemyError as e:
        logger.warning("Failed to list plans for %s: %s", handle, e)
        return []


@router.post("/plans/{handle}", response_model=PlanOut, status_code=201)
@limiter.limit("30/minute")
async def create_plan(
    request: Request,
    handle: str,
    body: PlanIn,
    response: Response,
):
    """Create a plan. DB failure → 502 so the frontend keeps localStorage + toasts."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            user_id = await _resolve_or_create_user(session, handle)
            plan = Plan(user_id=user_id, name=body.name, payload=body.payload)
            session.add(plan)
            await session.commit()
            await session.refresh(plan)
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            return _plan_out(plan)
    except SQLAlchemyError as e:
        logger.error("Failed to create plan for %s: %s", handle, e)
        raise HTTPException(502, detail="Plans storage unavailable.")


@router.put("/plans/{handle}/{plan_id}", response_model=PlanOut)
@limiter.limit("30/minute")
async def update_plan(
    request: Request,
    handle: str,
    plan_id: int,
    body: PlanIn,
    response: Response,
):
    """Update name/payload. Missing plan → 404."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            user = await _find_user(session, handle)
            plan = None
            if user:
                stmt = select(Plan).where(Plan.id == plan_id, Plan.user_id == user.id)
                plan = (await session.execute(stmt)).scalar_one_or_none()
            if not plan:
                raise HTTPException(404, detail=f"Plan {plan_id} not found.")
            plan.name = body.name  # pyright: ignore[reportAttributeAccessIssue]
            plan.payload = body.payload  # pyright: ignore[reportAttributeAccessIssue]
            plan.updated_at = datetime.now(timezone.utc)  # pyright: ignore[reportAttributeAccessIssue]
            await session.commit()
            await session.refresh(plan)
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            return _plan_out(plan)
    except SQLAlchemyError as e:
        logger.error("Failed to update plan %s: %s", plan_id, e)
        raise HTTPException(502, detail="Plans storage unavailable.")


@router.delete("/plans/{handle}/{plan_id}")
@limiter.limit("30/minute")
async def delete_plan(
    request: Request,
    handle: str,
    plan_id: int,
    response: Response,
):
    """Delete a plan. Missing plan → 404."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            user = await _find_user(session, handle)
            plan = None
            if user:
                stmt = select(Plan).where(Plan.id == plan_id, Plan.user_id == user.id)
                plan = (await session.execute(stmt)).scalar_one_or_none()
            if not plan:
                raise HTTPException(404, detail=f"Plan {plan_id} not found.")
            await session.delete(plan)
            await session.commit()
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            return {"deleted": True}
    except SQLAlchemyError as e:
        logger.error("Failed to delete plan %s: %s", plan_id, e)
        raise HTTPException(502, detail="Plans storage unavailable.")