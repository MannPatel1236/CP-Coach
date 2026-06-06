"""User route — DELETE /api/user/{handle}"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth import verify_hmac, verify_handle_signature
from rate_limiter import limiter
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from db.connection import AsyncSessionLocal
from db.connection import User
from routes.schemas import DeleteUserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["user"])


@router.delete("/user/{handle}", response_model=DeleteUserResponse)
@limiter.limit("30/minute")
async def delete_user(
    request: Request,
    handle: str,
    response: Response,
    _auth: None = Depends(verify_hmac),
):
    """Delete all data for a user (GDPR Right to Erasure).

    Requires HMAC authentication when CP_API_SECRET is configured.
    """
    verify_handle_signature(
        handle=handle,
        authorization=request.headers.get("Authorization"),
        x_timestamp=request.headers.get("X-Timestamp"),
    )

    async with AsyncSessionLocal() as session:
        # Find user by CF or LC handle (case-insensitive)
        stmt = select(User).where(
            (User.cf_handle.ilike(handle)) | (User.lc_handle.ilike(handle))
        )
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(404, detail=f"User '{handle}' not found.")

        try:
            await session.delete(user)
            await session.commit()
            logger.info("Deleted user data for handle: %s", handle)
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            return {"message": f"All data for '{handle}' has been deleted."}
        except SQLAlchemyError as e:
            await session.rollback()
            logger.error("Failed to delete user %s: %s", handle, e)
            raise HTTPException(500, detail="Failed to delete user data.")
