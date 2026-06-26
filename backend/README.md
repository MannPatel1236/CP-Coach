# CP Coach — Backend

Graph-Augmented Knowledge Tracing for Personalized Competitive Programming Training.

## Quick Start

### 1. Local Development

```bash
cd backend
python -m venv venv
source venv/bin/activate        # macOS/Linux
pip install -r requirements.txt
pip install torch==2.2.2 --index-url https://download.pytorch.org/whl/cpu
pip install torch-geometric

# Copy env template
cp .env.example .env

# Run server
uvicorn main:app --reload --port 8000
```

API docs auto-generated at: **http://localhost:8000/docs**

### 2. Docker (recommended)

From repo root:

```bash
docker-compose up --build
```

Services:
| Service | URL | Purpose |
|---------|-----|---------|
| Backend | http://localhost:8000 | FastAPI server |
| Adminer | http://localhost:8080 | Database GUI |
| Postgres | localhost:5432 | Database |

### 3. Training

```bash
cd backend
python -m training.train_dkt --help

# Example: train Graph-DKT on your data
python -m training.train_dkt \
  --data path/to/training.csv \
  --model graph_dkt \
  --epochs 50 \
  --batch 32 \
  --out weights/graph_dkt.pt
```

CSV format: `user_id, topic, solved, difficulty, timestamp_delta, weight`

### 4. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/deep` | Probes CF and LC API reachability |
| GET | `/api/analyze/{handle}?platform=cf&mode=quick` | Analyze user |
| GET/POST | `/api/recommend/{handle}?platforms=cf&top_k=20` | Recommendations |
| GET | `/api/progress/{handle}` | Weekly progress |
| GET | `/api/graph` | Topic prerequisite graph |
| DELETE | `/api/user/{handle}` | GDPR erasure (requires HMAC auth) |

### Environment Variables

See `.env.example` for all required variables.

---

## Deployment (Render + Supabase + Vercel)

The target topology is:

```
[Vercel: cp-coach.vercel.app]  →  [Render: FastAPI backend]  →  [Supabase: Postgres]
   (static React SPA)              (Docker, port 8000)            (pgbouncer pooler :6543)
```

### 1. Supabase — Database

1. Create a Supabase project, then in **Project Settings → Database**, copy the **Connection string → Transaction mode (port 6543)** URL. It looks like:
   ```
   postgresql://postgres.xxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   Paste this verbatim into Render's `DATABASE_URL` env var. The backend's
   `_ensure_db_url()` in `db/connection.py` will auto-convert the scheme to
   `postgresql+asyncpg://`.
2. **Schema is auto-applied on first deploy** via `lifespan → create_tables()`
   in `db/connection.py`, which executes `db/schema.sql` statement by
   statement (asyncpg can't do multi-statement in one `execute()`). To
   pre-verify, run from your local machine:
   ```bash
   psql "$DATABASE_URL" -f backend/db/schema.sql
   ```

### 2. Render — Backend

1. New → **Web Service** → connect this repo → **Root Directory: `backend`**.
2. **Environment: Docker.** Render auto-detects `backend/Dockerfile`.
3. **Health Check Path: `/health`**.
4. Set these env vars in the Render dashboard:

   | Key | Value | Notes |
   |-----|-------|-------|
   | `DATABASE_URL` | `postgresql://postgres.xxxx:[PASSWORD]@aws-0-…pooler.supabase.com:6543/postgres` | Supabase pooler URL. Auto-converted. |
   | `FRONTEND_ORIGINS` | `http://localhost:5173,https://cp-coach.vercel.app` | Comma-separated; lowercased on read. |
   | `RENDER` | `true` | Optional — triggers cloud-mode in `startup.sh` (skip local PG init). |
   | `CP_API_SECRET` | *(leave unset)* | See `backend/auth.py` — the public site intentionally runs without auth. |

5. Deploy. Confirm the boot log shows:
   ```
   DB engine: scheme=postgresql+asyncpg host=aws-0-….pooler.supabase.com:6543/postgres
   Database tables verified/created.
   CP Coach API started
   ```
6. Quick smoke test:
   ```bash
   curl https://<render-service>.onrender.com/health
   # {"status":"ok","version":"2.0","platforms":["cf","lc"]}
   ```

### 3. Vercel — Frontend

1. New Project → import this repo. Vite config is auto-detected.
2. **Environment Variables** (Production):
   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://<render-service>.onrender.com` |
3. Deploy. Vercel builds the React app with `VITE_API_URL` baked in at build time.
4. Confirm the browser network tab shows requests going to `<render-service>.onrender.com`, not `/api/cf`.

### 4. End-to-end smoke test

From the project root, after both Render and Vercel are deployed:

```bash
# Backend
BASE_URL=https://<render-service>.onrender.com bash backend/scripts/smoke_test.sh

# Frontend (manual)
open https://cp-coach.vercel.app
# Type a CF handle (e.g. "tourist"), click Analyze.
# Expect: profile card + weak areas + recommendations render within ~5s.
```

### Render free tier caveats

- **Cold start:** instance sleeps after 15 min of inactivity. First request
  after sleep takes ~30s. Acceptable for a research demo; upgrade to Starter
  ($7/mo) for always-on.
- **No multi-worker:** `slowapi`'s in-memory rate-limit storage is
  per-worker. With Render free's single worker, this is fine. If you
  scale to multiple workers, switch to Redis-backed storage.

