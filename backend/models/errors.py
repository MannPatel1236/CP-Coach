"""Shared error response schema for CP Coach API.

All error responses use a single, stable schema so the frontend
can switch on `code` instead of parsing human-readable strings.
"""

import logging

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ErrorResponse(BaseModel):
    code: str
    message: str
    details: dict | None = None


# Stable code map: don't change keys — frontend depends on them.
_STATUS_CODE_MAP: dict[int, str] = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    429: "RATELIMIT",
    500: "INTERNAL_ERROR",
    502: "PLATFORM_UNREACHABLE",
    503: "SERVICE_UNAVAILABLE",
}


def _infer_error_code(status_code: int) -> str:
    return _STATUS_CODE_MAP.get(status_code, "UNKNOWN_ERROR")


# ── Exception handlers (registered in main.py) ────────────────────────────────


async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    """Format all HTTPException responses as structured JSON."""
    code = _infer_error_code(exc.status_code)
    body = ErrorResponse(code=code, message=str(exc.detail), details=None)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


async def handle_catchall(request: Request, exc: Exception) -> JSONResponse:
    """Catch truly unhandled exceptions, log them, and return a safe error."""
    logger.exception("Unhandled exception during request to %s", request.url.path)
    body = ErrorResponse(
        code="INTERNAL_ERROR",
        message="An unexpected error occurred",
        details=None,
    )
    return JSONResponse(status_code=500, content=body.model_dump())
