"""Lightweight HMAC request authentication for anti-abuse protection.

DEPLOYMENT MODEL
----------------
This module is opt-in. The auth dependency is a no-op (pass-through) unless
the ``CP_API_SECRET`` environment variable is set.

Public deployments (e.g. https://cp-coach.vercel.app):
    Leave ``CP_API_SECRET`` UNSET. The rate limiter (``slowapi`` in
    ``rate_limiter.py``) is the only abuse mitigation. This is the honest
    security posture for a public research demo: HMAC between a static SPA
    and the API would require the secret in the browser bundle, which is
    not a real secret.

Non-public deployments:
    Set ``CP_API_SECRET`` to a strong random value, and arrange for all
    calling clients to sign requests with ``Authorization: HMAC <sig>`` and
    ``X-Timestamp: <unix-ts>`` headers. Recommended pattern: a server-side
    proxy (e.g. a Vercel serverless function) holds the secret and signs
    requests on behalf of the browser. The browser never sees the secret.

    Without a signing client, setting the secret will lock out all
    callers and the API will return 401 on every request.
"""

import hashlib
import hmac
import os
import time

from fastapi import Header, HTTPException

# Read CP_API_SECRET at module import time. If unset (the public deployment
# case), all auth dependencies below early-return without checking headers.
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
