"""CP Coach API — FastAPI entry point."""

import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

from rate_limiter import limiter  # noqa: E402
from routes import analyze, recommend, progress, graph, user  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


from db.connection import create_tables  # noqa: E402

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    try:
        await create_tables()
        logger.info("Database tables verified/created.")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
    logger.info("CP Coach API started")
    yield


app = FastAPI(title="CP Coach API", version="2.0", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# CORS
origins = [
    o.strip()
    for o in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(analyze.router)
app.include_router(recommend.router)
app.include_router(progress.router)
app.include_router(graph.router)
app.include_router(user.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0", "platforms": ["cf", "lc"]}

