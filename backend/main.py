"""CP Coach API — FastAPI entry point."""

import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from routes import analyze, recommend, progress, graph  # noqa: E402

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


@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0", "platforms": ["cf", "lc"]}

