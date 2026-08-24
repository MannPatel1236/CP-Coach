"""CP Coach API — FastAPI entry point."""

import os
import glob
import logging
import uuid
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
from routes import analyze, recommend, progress, graph, user, trajectory, plans, mastery_history  # noqa: E402
from routes.schemas import HealthResponse, HealthDeepResponse  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


from db.connection import create_tables  # noqa: E402


class _GraphDKTEnsemble:
    """Thin wrapper averaging N Graph-DKT folds' single-forward-pass output."""

    def __init__(self, folds: list) -> None:
        self.folds = folds

    def predict_mastery_full(self, sequence, topic_graph, n_checkpoints: int = 8, device="cpu"):
        """ONE forward per fold → (per-topic mean mastery, per-checkpoint mean history).

        Phase 4b perf: analyze() needs both outputs; calling predict_mastery and
        predict_mastery_history separately runs the whole ensemble twice.
        """
        acc = {t: 0.0 for t in topic_graph.TOPICS}
        hists = []
        for f in self.folds:
            m, h = f.predict_mastery_full(sequence, topic_graph, n_checkpoints=n_checkpoints, device=device)
            for k, v in m.items():
                acc[k] = acc.get(k, 0.0) + v
            hists.append(h)
        mastery = {k: v / len(self.folds) for k, v in acc.items()}
        merged = {}
        for k in topic_graph.TOPICS:
            per_fold = [h[k] for h in hists]
            n = len(per_fold[0]) if per_fold else 0
            merged[k] = [
                {"ts": per_fold[0][i]["ts"], "p": sum(f[i]["p"] for f in per_fold) / len(per_fold)}
                for i in range(n)
            ]
        return mastery, merged


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    try:
        await create_tables()
        app.state.db_ready = True
        logger.info("Database tables verified/created.")
    except Exception as e:
        app.state.db_ready = False
        logger.error(f"Failed to initialize database: {e}")

    # Pre-load Graph-DKT model once at startup (prefer 5-fold 10k ensemble)
    try:
        from models.graph_dkt import GraphDKTModel
        from data.topic_graph import CPTopicGraph
        weights_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")
        ensemble_paths = sorted(glob.glob(os.path.join(weights_dir, "graph_dkt_10k_fold*.pt")))
        if ensemble_paths:
            topic_graph = CPTopicGraph()
            folds = []
            for p in ensemble_paths:
                try:
                    folds.append(GraphDKTModel.load(p, topic_graph=topic_graph))
                except Exception as e:
                    logger.warning("Skipping fold %s: %s", p, e)
            if len(folds) >= 1:
                app.state.graph_dkt_model = _GraphDKTEnsemble(folds)
                logger.info("Loaded %d-fold Graph-DKT 10k ensemble", len(folds))
            else:
                app.state.graph_dkt_model = None
                logger.warning("Ensemble glob matched %d paths but 0 folds loaded", len(ensemble_paths))
        else:
            weights_path = os.getenv("MODEL_WEIGHTS_PATH", "./weights/graph_dkt.pt")
            if os.path.exists(weights_path):
                topic_graph = CPTopicGraph()
                model = GraphDKTModel.load(weights_path, topic_graph=topic_graph)
                app.state.graph_dkt_model = model
                logger.info("Graph-DKT model loaded successfully (single file)")
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


async def _slowapi_handler(request: Request, exc: RateLimitExceeded):  # pyright: ignore[reportGeneralTypeIssues]
    return _rate_limit_exceeded_handler(request, exc)  # pyright: ignore[reportArgumentType]


app.add_exception_handler(RateLimitExceeded, _slowapi_handler)  # pyright: ignore[reportArgumentType]

# Structured error responses for all other exceptions
app.add_exception_handler(HTTPException, handle_http_exception)  # pyright: ignore[reportArgumentType]
app.add_exception_handler(Exception, handle_catchall)

# Request ID — must be first so downstream handlers can reference it
class RequestIDMiddleware(BaseHTTPMiddleware):
    """Add X-Request-ID to every response for request tracing."""
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

app.add_middleware(RequestIDMiddleware)

# Security headers middleware
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # API returns JSON only — restrict all content loading.
        # Exclude Swagger UI (/docs) and ReDoc (/redoc) so those pages
        # can load their inline JS, CSS, and fonts.
        if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
            response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Reject oversized JSON-write bodies (> 1 MB) on /recommend and /plans
class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """Reject request bodies larger than MAX_SIZE bytes for POST/PUT /recommend and /plans.

    PUT is included: PlanIn.payload is an untyped dict, so an uncapped PUT
    reopens the same hole this middleware closes for POST. DELETE carries no body.

    Only a verifiable Content-Length ≤ MAX_SIZE passes. A chunked
    transfer-encoding (or a missing/garbage length) gives the middleware no size
    contract, yet Starlette still buffers the whole body in memory before
    validation — so those requests are rejected outright rather than trusted.
    Browsers always send Content-Length on these JSON writes; only streaming
    clients (curl -T) hit this branch.
    """
    MAX_SIZE = 1_000_000  # 1 MB

    def _too_large(self, request, reason: str):
        from fastapi.responses import JSONResponse
        response = JSONResponse(
            status_code=413,
            content={"detail": f"{reason} Max {self.MAX_SIZE} bytes."},
        )
        # Ensure security headers and request ID on the early-return path.
        # RequestIDMiddleware is inner (registered first → innermost), so
        # on this outermost early-return it has not yet set request.state.request_id;
        # generate inline, matching what it would have produced.
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        rid = request.state.request_id if hasattr(request.state, "request_id") else None
        if rid is None:
            rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
            request.state.request_id = rid
        response.headers["X-Request-ID"] = rid
        return response

    async def dispatch(self, request, call_next):
        if request.method in ("POST", "PUT") and request.url.path.startswith(("/api/recommend", "/api/plans")):
            content_length = request.headers.get("content-length")
            transfer_encoding = (request.headers.get("transfer-encoding") or "").lower()
            if not content_length or "chunked" in transfer_encoding:
                return self._too_large(request, "Body size unverifiable (chunked or missing length).")
            try:
                size = int(content_length)
            except (ValueError, TypeError):
                return self._too_large(request, "Unparseable Content-Length.")
            if size > self.MAX_SIZE:
                return self._too_large(request, "Request body too large.")
        return await call_next(request)

app.add_middleware(MaxBodySizeMiddleware)

# CORS
origins = [
    o.strip().lower()
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
app.include_router(trajectory.router)
app.include_router(mastery_history.router)
app.include_router(graph.router)
app.include_router(user.router)
app.include_router(plans.router)


@app.get("/health", response_model=HealthResponse)
async def health(request: Request):
    model = getattr(request.app.state, "graph_dkt_model", None)
    return {
        "status": "ok",
        "version": "2.0",
        "platforms": ["cf", "lc"],
        "model_loaded": model is not None,
        "database": bool(getattr(request.app.state, "db_ready", False)),
    }


@app.get("/health/deep", response_model=HealthDeepResponse)
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

