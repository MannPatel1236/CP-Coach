"""Plans route — GET/POST /api/plans/{handle}, PUT/DELETE /api/plans/{handle}/{id}

Greenhouse Phase 5b — the only DB change in the whole program (spec §7). Saved
Workbook checklists, handle-keyed (no account system, §13 #4). Routes carry the
same opt-in ``Depends(verify_hmac)`` as every sibling handle-keyed route
(pass-through unless CP_API_SECRET is set). Read-side DB failure → [] (frontend
falls back to localStorage, spec §5.2 #9); write-side failure → 502 (frontend
keeps the optimistic localStorage copy + toast, never silently loses data).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from auth import verify_hmac, verify_handle_signature
from rate_limiter import limiter
from db.connection import (
    AsyncSessionLocal, Plan, find_user_by_handle, get_or_create_user, utcnow_naive,
)
from routes.schemas import PlanDeleteResponse, PlanIn, PlanOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["plans"])


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
    _auth: None = Depends(verify_hmac),
):
    """List saved plans newest-first. No user / DB failure → [] (never an error)."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            user = await find_user_by_handle(session, handle)
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
    _auth: None = Depends(verify_hmac),
):
    """Create a plan. DB failure → 502 so the frontend keeps localStorage + toasts."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            # Resolve identity symmetric to the readers: either-column first so
            # an LC-keyed row for this handle is reused instead of minting a
            # duplicate {cf_handle:X} twin that would make every later
            # either-column lookup ambiguous (MultipleResultsFound).
            user = await find_user_by_handle(session, handle)
            if not user:
                user = await get_or_create_user(session, handle)
            plan = Plan(user_id=user.id, name=body.name, payload=body.payload)  # pyright: ignore[reportAttributeAccessIssue]
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
    _auth: None = Depends(verify_hmac),
):
    """Update name/payload. Missing plan → 404."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            user = await find_user_by_handle(session, handle)
            plan = None
            if user:
                stmt = select(Plan).where(Plan.id == plan_id, Plan.user_id == user.id)  # pyright: ignore[reportAttributeAccessIssue]
                plan = (await session.execute(stmt)).scalar_one_or_none()
            if not plan:
                raise HTTPException(404, detail=f"Plan {plan_id} not found.")
            plan.name = body.name  # pyright: ignore[reportAttributeAccessIssue]
            plan.payload = body.payload  # pyright: ignore[reportAttributeAccessIssue]
            plan.updated_at = utcnow_naive()  # pyright: ignore[reportAttributeAccessIssue]
            await session.commit()
            await session.refresh(plan)
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            return _plan_out(plan)
    except SQLAlchemyError as e:
        logger.error("Failed to update plan %s: %s", plan_id, e)
        raise HTTPException(502, detail="Plans storage unavailable.")


@router.delete("/plans/{handle}/{plan_id}", response_model=PlanDeleteResponse)
@limiter.limit("30/minute")
async def delete_plan(
    request: Request,
    handle: str,
    plan_id: int,
    response: Response,
    _auth: None = Depends(verify_hmac),
):
    """Delete a plan. Missing plan → 404."""
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )
    try:
        async with AsyncSessionLocal() as session:
            user = await find_user_by_handle(session, handle)
            plan = None
            if user:
                stmt = select(Plan).where(Plan.id == plan_id, Plan.user_id == user.id)  # pyright: ignore[reportAttributeAccessIssue]
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