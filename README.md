<div align="center">

# CP Coach

**Graph-Augmented Knowledge Tracing for Personalized Competitive Programming Training**

<br>

[![Live Demo](https://img.shields.io/badge/Live-cp--coach.vercel.app-00C853?style=for-the-badge&logo=vercel&logoColor=white)](https://cp-coach.vercel.app)
[![Codeforces](https://img.shields.io/badge/Codeforces-1890FF?style=for-the-badge&logo=codeforces&logoColor=white)](https://codeforces.com)
[![LeetCode](https://img.shields.io/badge/LeetCode-FFA116?style=for-the-badge&logo=leetcode&logoColor=black)](https://leetcode.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)

<br>

*Analyze your competitive programming profile, uncover weak topics, and get AI-powered problem recommendations across Codeforces and LeetCode.*

</div>

---

## Overview

CP Coach is a full-stack web application that connects to your **Codeforces** and/or **LeetCode** account to analyze your submission history, identify skill gaps, and recommend personalized practice problems. It features a novel **Graph-DKT** architecture that layers a Graph Convolutional Network on top of a Deep Knowledge Tracing backbone, guided by a directed prerequisite graph over 22 canonical competitive programming topics.

### Key Features

- **Multi-Platform Analysis** - Supports Codeforces + LeetCode, individually or combined
- **Skill Visualization** - Radar and bar charts showing recency-weighted topic mastery
- **Weak Area Detection** - Identifies your weakest topics with severity indicators
- **Graph-DKT Model** - LSTM + GCN hybrid for personalized mastery prediction
- **Smart Matching** - Difficulty band recommendation with stretch fallback
- **Prerequisite-Aware** - Recommendations respect topic dependency graph

> **Research Inspiration:** *"KSAP - Knowledge Structure-Aware Problem Recommendation"* (Wang et al., Springer KAIS, 2025)

---

## Tech Stack

| Layer | Technologies |
|:------|:------------|
| Frontend | React 18, Vite, Recharts, Framer Motion |
| Backend | FastAPI, SQLAlchemy (async), asyncpg, slowapi |
| ML | PyTorch, PyTorch Geometric |
| Database | PostgreSQL (local) / Supabase (production) |
| Hosting | Vercel (frontend), Docker (backend) |

---

## Architecture

```
+--------------------------------------------+
|                Frontend (React)            |
|  SearchBar  -  Dashboard  -  Charts       |
+--------------------------------------------+
                      |
                      | fetch()
                      v
+--------------------------------------------+
|              FastAPI Backend               |
|  /api/analyze - /api/recommend - /api/graph|
+--------------------------------------------+
      |              |              |
      v              v              v
 Codeforces    LeetCode      PostgreSQL
    REST        GraphQL         |
```

---

## Quick Start

### Prerequisites

- Node.js >= 18
- Python >= 3.11
- PostgreSQL >= 14 (or Docker)

### Frontend

```bash
npm install
npm run dev          # http://localhost:5173
```

Create `.env` in the project root:
```bash
VITE_API_URL=http://localhost:8000
```

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env.local  # edit DATABASE_URL and other secrets
```

Development server:
```bash
uvicorn main:app --reload --port 8000
```

### Full Stack (Docker)

```bash
# Uses backend/.env.local (no DATABASE_URL = local Postgres)
docker-compose up --build
```

Services:
- Backend on `http://localhost:8000`
- PostgreSQL on `5432`
- Adminer (DB UI) on `http://localhost:8080`

---

## Environment Variables

### Frontend

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | FastAPI base URL. Empty = client-only mode (CF only) |

### Backend

| Variable | Required? | Description |
|----------|:---------:|-------------|
| `DATABASE_URL` | Yes | PostgreSQL asyncpg URL. Required, no default. |
| `FRONTEND_ORIGINS` | No | Comma-delimited CORS origins |
| `MODEL_WEIGHTS_PATH` | No | Path to Graph-DKT PyTorch weights |
| `SKIP_LOCAL_DB` | No | Set to skip local Postgres setup (cloud/prod) |
| `POSTGRES_USER` | Local only | Required when using docker-compose DB |
| `POSTGRES_PASSWORD` | Local only | Required when using docker-compose DB |

---

## API Endpoints

| Endpoint | Method | Description |
|----------|:------:|-------------|
| `/api/analyze/{handle}` | GET | Analyze profile (`platform=cf|lc`, `mode=quick|deep`) |
| `/api/recommend/{handle}` | GET/POST | Get recommendations (`platforms=cf,lc`, `focus_topics=...`) |
| `/api/progress/{handle}` | GET | Weekly per-topic solve rates |
| `/api/graph` | GET | Prerequisite graph topology (JSON) |
| `/health` | GET | Health check |

**Example:**
```bash
curl "http://localhost:8000/api/analyze/tourist?platform=cf&mode=deep"
```

---

## Graph-DKT Model

Deep Knowledge Tracing with a Graph Convolutional Network for structured topic relationships.

### Input Features (per interaction)

| Feature | Description |
|---------|-------------|
| `topic_id` | Canonical topic index (0-21) via `Embedding(22, 64)` |
| `solved` | Binary: 1 if solved, 0 if failed |
| `difficulty` | Problem rating normalized to [0, 1] |
| `timestamp_delta` | Days since previous submission (normalized) |

### Architecture

```
Input (67D) = Embedding(64) + solved(1) + difficulty(1) + ts_delta(1)
    |
    v
Linear(67 -> 128) + ReLU
    |
    v
LSTM(128 -> 128, dropout=0.2)*
    |
    | h_t
    |-----> GCNConv(128, 64) + GCNConv(64, 64)
    |              |
    |          h_graph (64D per topic)
    |              |
    |-----> concat[h_t, h_graph] (192D)
                   |
                   v
            Linear(192 -> 22)
                   |
                   v
            Sigmoid -> p_mastery per topic
```

*Explicit `nn.Dropout` applied after LSTM output, since `num_layers=1` means
`dropout` in the LSTM constructor is a no-op.

### Training

- **Loss:** Binary Cross Entropy
- **Optimizer:** Adam, lr=0.001
- **Batch size:** 32
- **Early stopping:** Patience=5

---

## CP Prerequisite Graph

22 canonical topics with 18 directed prerequisite edges:

```
implementation
    |
    v
   math
 /   |   \
v    v    v
greedy   number_theory   two_pointers
  |          |                |
  v          v                v
binary_search combinatorics   binary_search
  |                            |
  v                            v
data_structures            sortings ----┐
  |                                     |
  |---> trees                           v
  |         \                        data_structures
  |          \                          |
  |           v                         v
  |--->  dfs_and_similar  <--- graphs    (closed loop)
              |
              v
             dp --> dp_on_trees
              |
              ^--- greedy
```

Full topic list:
`implementation`, `math`, `greedy`, `constructive_algorithms`, `binary_search`, `two_pointers`, `sortings`, `strings`, `number_theory`, `combinatorics`, `dfs_and_similar`, `graphs`, `trees`, `dp`, `dp_on_trees`, `data_structures`, `bitmasks`, `divide_and_conquer`, `hashing`, `geometry`, `flows`, `brute_force`

### Recency Decay

Submissions are weighted by recency to prioritize recent performance:

```
weight = 1.0 - (0.8 * idx) / max(total - 1, 1)
```

- `idx = 0` (most recent) -> `weight = 1.0`
- `idx = total - 1` (oldest) -> `weight = 0.2`

---

## Project Structure

```
CP-Coach/
├── src/                        # React frontend (Vite)
│   ├── api.js                  # CF API calls + data processing
│   ├── api/backendClient.js      # FastAPI backend wrapper
│   ├── hooks/useAnalysis.js    # Analysis state machine
│   ├── hooks/useRecommendations.js
│   ├── components/             # UI components
│   ├── App.jsx                 # Root component
│   ├── main.jsx                # Entry point
│   └── index.css               # Design system CSS
├── api/                        # Vercel serverless functions
│   └── cf.js                   # CORS proxy for Codeforces
├── backend/
│   ├── main.py                 # FastAPI entry point
│   ├── Dockerfile
│   ├── startup.sh              # Startup script (local/cloud split)
│   ├── .env.local              # Local dev (no DATABASE_URL)
│   ├── .env.example            # Production template
│   ├── .dockerignore           # Prevents secrets in Docker context
│   ├── routes/
│   │   ├── analyze.py          # GET /api/analyze
│   │   ├── recommend.py        # GET/POST /api/recommend
│   │   ├── progress.py         # GET /api/progress
│   │   ├── graph.py            # GET /api/graph
│   │   └── user.py
│   ├── platforms/
│   │   ├── codeforces.py       # CF REST client (httpx)
│   │   ├── leetcode.py         # LC GraphQL client (httpx)
│   │   └── normalizer.py       # Normalized format conversion
│   ├── models/
│   │   ├── dkt.py              # LSTM backbone
│   │   ├── graph_dkt.py        # GCN-augmented DKT
│   │   └── recommender.py      # Prerequisite-aware engine
│   ├── data/
│   │   ├── preprocessor.py     # Feature engineering + recency decay
│   │   └── topic_graph.py      # Prerequisite graph (22 topics, 18 edges)
│   ├── db/
│   │   ├── schema.sql          # PostgreSQL schema + seed data
│   │   └── connection.py       # SQLAlchemy async engine + ORM
│   ├── training/
│   │   ├── train_dkt.py        # CLI training script
│   │   └── evaluate.py         # AUC, accuracy, per-topic metrics
│   └── weights/                # Model checkpoints (gitignored)
├── docker-compose.yml          # PG + backend stack
├── vercel.json                 # Vercel routing
├── vite.config.js              # Dev proxy
└── package.json                # Frontend deps
```

---

## Database Schema

```sql
-- Users (CF + LC handles)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  cf_handle VARCHAR(50),
  lc_handle VARCHAR(50),
  primary_platform VARCHAR(5) DEFAULT 'cf',
  last_synced TIMESTAMP
);

-- Submissions (normalized from both platforms)
CREATE TABLE IF NOT EXISTS submissions (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(5) NOT NULL,
  problem_id VARCHAR(60) NOT NULL,
  verdict VARCHAR(20),
  topics TEXT[],
  difficulty INTEGER,
  submitted_at TIMESTAMP
);

-- Cached problem metadata
CREATE TABLE IF NOT EXISTS problems (
  problem_id VARCHAR(60) PRIMARY KEY,
  platform VARCHAR(5),
  name TEXT,
  difficulty INTEGER,
  topics TEXT[],
  solve_count INTEGER,
  url TEXT
);

-- Prerequisite graph edges
CREATE TABLE IF NOT EXISTS topic_graph (
  from_topic VARCHAR(50),
  to_topic VARCHAR(50),
  weight FLOAT DEFAULT 1.0,
  PRIMARY KEY (from_topic, to_topic)
);

-- User mastery state per topic
CREATE TABLE IF NOT EXISTS kt_states (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(50),
  p_mastery FLOAT,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, topic)
);
```

---

## Deployment

### Frontend (Vercel)

```bash
vercel --prod
```

### Backend (Docker)

```bash
# Production build
docker build -t cpcoach-backend ./backend

# Run with DATABASE_URL pointing to your Postgres
# docker run -e DATABASE_URL=... -p 8000:8000 cpcoach-backend
```

### Database (Supabase / Self-hosted)

Enable `pg_trgm` for trigram search indexes:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

---

## License

Developed as part of Innovative Product Development (IPD) at **DJ Sanghvi College of Engineering**.

---

<div align="center">

**[Live Demo](https://cp-coach.vercel.app) - [Report a Bug](https://github.com/MannPatel1236/CP-Coach/issues)**

*Built for the competitive programming community*

</div>
