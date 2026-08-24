"""User route — DELETE /api/user/{handle}"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth import verify_hmac, verify_handle_signature
from rate_limiter import limiter
from sqlalchemy.exc import SQLAlchemyError

from db.connection import AsyncSessionLocal, delete_users_by_handle
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
        # Erase EVERY row matching the handle on either column — exact
        # case-insensitive equality, never ilike(): '_' is a legal CF-handle
        # char AND a LIKE wildcard, so the old ilike lookup could erase a
        # stranger's row. Dual-platform users legitimately hold two rows for
        # one string ({cf_handle:X} + {lc_handle:X}); right-to-erasure covers
        # both halves in one call.
        try:
            deleted = await delete_users_by_handle(session, handle)
            if not deleted:
                raise HTTPException(404, detail=f"User '{handle}' not found.")
            await session.commit()
            logger.info("Deleted user data for handle: %s (%d row(s))", handle, deleted)
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            return {"message": f"All data for '{handle}' has been deleted."}
        except SQLAlchemyError as e:
            await session.rollback()
            logger.error("Failed to delete user %s: %s", handle, e)
            raise HTTPException(500, detail="Failed to delete user data.")
