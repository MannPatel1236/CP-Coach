"""CP Coach API — FastAPI entry point."""

import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

from rate_limiter import limiter  # noqa: E402
from models.errors import handle_http_exception, handle_catchall  # noqa: E402
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

    # Pre-load Graph-DKT model once at startup
    try:
        from models.graph_dkt import GraphDKTModel
        from data.topic_graph import CPTopicGraph
        import os
        weights_path = os.getenv("MODEL_WEIGHTS_PATH", "./weights/graph_dkt.pt")
        if os.path.exists(weights_path):
            topic_graph = CPTopicGraph()
            model = GraphDKTModel.load(weights_path, topic_graph=topic_graph)
            app.state.graph_dkt_model = model
            logger.info("Graph-DKT model loaded successfully")
        else:
            app.state.graph_dkt_model = None
            logger.info("No model weights found at %s — using rule-based fallback", weights_path)
    except Exception as e:
        app.state.graph_dkt_model = None
        logger.error("Failed to load Graph-DKT model: %s", e)

    logger.info("CP Coach API started")
    yield


app = FastAPI(title="CP Coach API", version="2.0", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter


async def _slowapi_handler(request: Request, exc: RateLimitExceeded):
    return _rate_limit_exceeded_handler(exc, request)


app.add_exception_handler(RateLimitExceeded, _slowapi_handler)

# Structured error responses for all other exceptions
app.add_exception_handler(HTTPException, handle_http_exception)
app.add_exception_handler(Exception, handle_catchall)

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


@app.get("/health/deep")
async def health_deep():
    """Check downstream API availability (CF + LeetCode)."""
    import httpx
    results = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        # Check Codeforces
        try:
            r = await client.get("https://codeforces.com/api/user.info?handles=tourist")
            results["codeforces"] = "ok" if r.status_code == 200 else f"error_{r.status_code}"
        except Exception:
            results["codeforces"] = "unreachable"

        # Check LeetCode
        try:
            r = await client.post(
                "https://leetcode.com/graphql",
                json={"query": "{ matchedUser(username: \"leetcode\") { username } }"},
                headers={"Content-Type": "application/json", "Referer": "https://leetcode.com"},
            )
            results["leetcode"] = "ok" if r.status_code == 200 else f"error_{r.status_code}"
        except Exception:
            results["leetcode"] = "unreachable"

    all_ok = all(v == "ok" for v in results.values())
    return {"status": "ok" if all_ok else "degraded", "downstream": results}

