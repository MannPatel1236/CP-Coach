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
            return xff.split(",")[0].strip()
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
