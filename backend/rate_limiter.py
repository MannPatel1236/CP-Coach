"""Shared rate limiter instance for all route modules."""

import ipaddress
from fastapi import Request
from slowapi import Limiter

_TRUSTED_PROXIES = ["127.0.0.1", "::1"]

def _is_trusted(host: str) -> bool:
    if host in _TRUSTED_PROXIES:
        return True
    try:
        ip = ipaddress.ip_address(host)
        return ip.is_loopback or ip.is_private
    except ValueError:
        return False

def _get_client_ip(request: Request) -> str:
    """Return the original client IP, respecting trusted reverse proxies."""
    remote = request.client.host if request.client else "unknown"
    # Only trust forwarded headers when behind a known proxy
    if _is_trusted(remote):
        xff = request.headers.get("x-forwarded-for")
        if xff:
            hops = [h.strip() for h in xff.split(",") if h.strip()]
            # XFF is append-ordered: rightmost = what the last trusted proxy saw
            # as its TCP peer; leftmost = first-hop claim, fully client-spoofable.
            # Walk right→left skipping trusted proxies; first non-trusted hop is
            # the real client. (ponytail: trusts the one proxy we run behind; a
            # multi-hop chain would need an explicit proxy-count depth limit.)
            for hop in reversed(hops):
                if not _is_trusted(hop):
                    return hop
            return hops[-1] if hops else remote
        xr = request.headers.get("x-real-ip")
        if xr:
            return xr.strip()
    return remote

# NOTE: In-memory storage means rate limits are per-worker.
# For single-worker docker-compose this is fine. For multi-worker
# production, switch to slowapi.storage.RedisStorage:
#   from slowapi.storage import RedisStorage
#   limiter = Limiter(key_func=_get_client_ip, storage_uri="redis://localhost:6379")
limiter = Limiter(key_func=_get_client_ip)
