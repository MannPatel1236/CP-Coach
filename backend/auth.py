"""Lightweight HMAC request authentication for anti-abuse protection."""

import hashlib
import hmac
import os
import time

from fastapi import Header, HTTPException

_API_SECRET = os.getenv("CP_API_SECRET", "")
_STALE_SECONDS = int(os.getenv("CP_AUTH_STALE_SECONDS", "300"))  # 5 minutes


def _hmac_sign(timestamp: str, handle: str) -> str:
    """HMAC-SHA256 of timestamp + handle using the shared secret."""
    if not _API_SECRET:
        return ""
    payload = f"{timestamp}{handle}"
    return hmac.new(
        _API_SECRET.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()


async def verify_hmac(
    authorization: str | None = Header(None, alias="Authorization"),
    x_timestamp: str | None = Header(None, alias="X-Timestamp"),
) -> None:
    """FastAPI dependency that verifies HMAC signature headers and timestamp freshness.

    Auth is disabled (pass-through) when CP_API_SECRET is not set,
    allowing seamless local development.

    Note: handle-specific signature binding is verified at the route level
    via verify_handle_signature(), since FastAPI dependencies don't have
    access to path parameters at resolution time.
    """
    if not _API_SECRET:
        return  # Auth disabled in dev/staging without CP_API_SECRET

    if not authorization or not authorization.startswith("HMAC ") or not x_timestamp:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization header (expected: HMAC <signature>) and X-Timestamp header",
        )

    try:
        ts_int = int(x_timestamp)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp format")

    age = time.time() - ts_int
    # Reject stale past timestamps; allow up to 1s of future clock skew
    if age > _STALE_SECONDS or age < -1:
        raise HTTPException(status_code=401, detail="Request timestamp is stale (max 5 minutes)")


def verify_handle_signature(handle: str, authorization: str | None, x_timestamp: str | None) -> None:
    """Verify the HMAC signature is bound to the specific handle being operated on."""
    if not _API_SECRET:
        return
    if not authorization or not authorization.startswith("HMAC ") or not x_timestamp:
        raise HTTPException(status_code=401, detail="Missing auth headers")

    sig = authorization[5:]
    expected = _hmac_sign(x_timestamp, handle)
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid HMAC signature")
