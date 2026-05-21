# AGENTS.md — CP Coach

## Project overview

CP Coach is a personalized competitive programming analytics and training web app.
Research title: "Graph-Augmented Knowledge Tracing for Personalized Competitive Programming Training"
Base paper: KSAP — Wang et al., Springer KAIS, 2025
Deployed at: https://cp-coach.vercel.app
Platforms supported: Codeforces (CF) + LeetCode (LC)

---

## Repo structure

```
CP-Coach/
├── src/                         ← ALL React source (NOT in frontend/)
│   ├── App.jsx                  ← root component
│   ├── main.jsx                 ← ReactDOM entry
│   ├── api.js                   ← ALL CF API calls + data processing logic
│   ├── utils.js                 ← CF semantic colors — NEVER MODIFY
│   ├── index.css                ← Design system CSS vars — NEVER MODIFY
│   ├── lib/motion.js            ← framer-motion variants
│   ├── api/
│   │   └── backendClient.js     ← FastAPI backend fetch wrapper (LC support)
│   ├── hooks/
│   │   ├── useAnalysis.js       ← state machine for analyze flow (CF+LC)
│   │   └── useRecommendations.js← recommendations state + fetch logic
│   └── components/
│       ├── Header.jsx, SearchBar.jsx, LandingPage.jsx, ProfileCard.jsx
│       ├── WeakAreas.jsx, TagOverview.jsx, SkillChart.jsx, TopicPicker.jsx
│       ├── Recommendations.jsx, SuccessBanner.jsx, LoadingState.jsx
│       ├── ErrorState.jsx, Icons.jsx
├── api/
│   └── cf.js                    ← Vercel serverless CORS proxy
├── backend/
│   ├── main.py                  ← FastAPI app, CORS, routers, health check
│   ├── Dockerfile               ← Python 3.11-slim + torch CPU + PyG
│   ├── startup.sh               ← Wait for PG, apply schema, start uvicorn
│   ├── routes/                  ← analyze, recommend, progress, graph
│   ├── platforms/               ← codeforces.py, leetcode.py, normalizer.py
│   ├── models/                  ← dkt.py, graph_dkt.py, recommender.py
│   ├── data/                    ← preprocessor.py, topic_graph.py
│   ├── db/                      ← schema.sql, connection.py
│   ├── training/                ← train_dkt.py, evaluate.py
│   └── weights/                 ← gitignored, model weights live here
├── docker-compose.yml           ← backend + postgres + adminer
├── package.json                 ← react, recharts, framer-motion (NO axios)
├── vite.config.js               ← /cf-api proxy for dev (→ codeforces.com/api)
└── vercel.json                  ← /api/cf/:path* rewrite
```

---

## Critical rules

1. **SURGICAL EDITS ONLY** — minimum lines changed, never refactor working code
2. **NEVER touch utils.js** — CF semantic colors carry official meaning, breaking them breaks the product
3. **NEVER touch index.css** — CSS variable system is load-bearing
4. **NO axios** — project uses native fetch() only
5. **NO placeholder stubs** — every function must be fully implemented
6. **NO hardcoded secrets** — all keys and URLs go in .env files
7. **Backend goes in backend/** — never mix Python files into src/
8. **Multi-platform data normalizes to a shared format BEFORE entering any shared logic**
9. **Test every prompt before moving to the next one**
10. **CF existing functionality must never break** — LeetCode is additive only
11. **If any file is moved, renamed, or created, update the repo structure section in AGENTS.md immediately**

---

## Dev commands

**Frontend:**
```bash
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # Production build
```

**Backend:**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install torch-geometric
cp .env.example .env
uvicorn main:app --reload --port 8000   # http://localhost:8000/docs
```

**Docker (all services):**
```bash
docker-compose up --build
# Services: Backend :8000, Adminer :8080, Postgres :5432
```

**Model training:**
```bash
cd backend
python -m training.train_dkt --data path/to/data.csv --model graph_dkt --epochs 50 --batch 32 --out weights/graph_dkt.pt
```

---

## Data flow (CF Phase 1 — working, do not break)

```
handle → useAnalysis.analyze()
  → fetchUserInfo()        [src/api.js → /api/cf/user.info]
  → fetchSubmissions()     [src/api.js → /api/cf/user.status, paginated up to 8000]
  → buildTagProfile()      [src/api.js — recency-weighted]
  → findWeakTags()         [src/api.js — threshold 65% acRate]
  → fetchProblemsForTags() [src/api.js → /api/cf/problemset.problems]
  → buildRecommendations() [src/api.js — difficulty band ±350, fallback ±600]
```

**Recency decay formula (MUST replicate in backend):**
```
weight = 1.0 - (0.8 * idx) / Math.max(total - 1, 1)
idx=0 (most recent) → weight=1.0
idx=total-1 (oldest) → weight=0.2
```

---

## Multi-platform: Codeforces + LeetCode

### Codeforces
- Public REST API: https://codeforces.com/api
- No auth required
- Endpoints: /user.info, /user.status, /problemset.problems
- Dev proxy: `/cf-api/*` → `https://codeforces.com/api/*` (vite.config.js)

### LeetCode (additive only, must not break CF)
- GraphQL endpoint: https://leetcode.com/graphql
- No auth, no API key
- **Must be called server-side from FastAPI** (CORS blocks browser)
- Required headers: `Content-Type: application/json`, `Referer: https://leetcode.com`

Verified GraphQL queries (in backend/platforms/leetcode.py):
1. `getUserProfile` — username, submitStats (acSubmissionNum by difficulty)
2. `getRecentSubmissions` — title, titleSlug, timestamp, statusDisplay, lang
3. `getProblemDetails` — title, difficulty, topicTags (name, slug)
4. `getUserContestRanking` — attendedContestsCount, rating, globalRanking

**LC difficulty → numeric rating:** Easy 800-1100, Medium 1200-1500, Hard 1600-2000

### Normalized submission format (BOTH platforms)
```python
{
  "problem_id": str,     # "cf-1234A" or "lc-two-sum"
  "platform": str,       # "cf" or "lc"
  "verdict": str,        # "OK" | "WRONG_ANSWER" | "OTHER"
  "topics": list[str],   # normalized internal topic names
  "difficulty": int,     # numeric 800–3500
  "timestamp": int,      # unix milliseconds
}
```

---

## Topic normalization (22 canonical names)

```
implementation, math, greedy, constructive_algorithms, binary_search,
two_pointers, sortings, strings, number_theory, combinatorics,
dfs_and_similar, graphs, trees, dp, dp_on_trees, data_structures,
bitmasks, divide_and_conquer, hashing, geometry, flows, brute_force
```

**CF tag → internal name:** `dfs and similar`→`dfs_and_similar`, `binary search`→`binary_search`, etc. All others: `tag.lower().replace(" ", "_")`

**LC slug → internal name:** `dynamic-programming`→`dp`, `hash-table`→`hashing`, `depth-first-search`→`dfs_and_similar`, `union-find`→`data_structures`, etc.

---

## FastAPI endpoints

```
GET  /api/analyze/{handle}?platform=cf|lc&mode=quick|deep
GET  /api/recommend/{handle}?platforms=cf,lc&top_k=20&focus_topics=dp,graphs
GET  /api/progress/{handle}?platform=cf|lc
GET  /api/graph
POST /api/sync/{handle}?platform=cf|lc
GET  /health
```

---

## Graph-DKT model spec (core research contribution)

```
Input: x_t = (topic_id, solved: 0|1, difficulty: normalized, timestamp_delta: normalized)

STEP 1 — DKT Backbone (LSTM)
  embedding: Embedding(num_topics, 64)
  input_proj: Linear(67, 128)        # 64 + solved + difficulty + ts_delta
  lstm: LSTM(128, 128, layers=1, dropout=0.2, batch_first=True)
  output: Linear(128, num_topics) → Sigmoid

STEP 2 — GCN Graph Layer (PyTorch Geometric GCNConv)
  gcn1: GCNConv(128, 64) → ReLU
  gcn2: GCNConv(64, 64)
  edge_index: CPTopicGraph, registered as buffer
  h_t per-topic → aggregate over prerequisite neighbors

STEP 3 — Fusion
  h_fused = concat(h_t, h_graph)     # 128 + 64 = 192
  p_mastery = sigmoid(Linear(192, num_topics))

Training: BCELoss, Adam lr=0.001, batch=32, dropout=0.2, early stopping patience=5
```

---

## CP prerequisite graph (18 directed edges)

```
implementation → math
math → greedy, constructive_algorithms, number_theory, two_pointers
greedy → binary_search, dp
binary_search → data_structures, sortings
data_structures → trees, graphs
trees → dfs_and_similar
graphs → dfs_and_similar
dfs_and_similar → dp
dp → dp_on_trees
sortings → data_structures
number_theory → combinatorics
two_pointers → binary_search
```

---

## CF semantic colors (utils.js) — NEVER CHANGE

```
acColor:   red < 40% | amber < 65% | green >= 65%
rankColor: newbie #808080 | pupil #008000 | specialist #03a89e | expert #0000ff
           candidate master #aa00aa | master/intl master #ff8c00 | grandmaster #ff0000
diffColor/ratingColor: tiered by rating 0/1200/1400/1600/1900/2100/2400+
```

---

## Research contribution summary

Novel claims for the paper:
1. First application of KT to competitive programming
2. Directed prerequisite graph for CP topics (not co-occurrence based)
3. Cross-platform skill normalization: CF + LeetCode → unified topic taxonomy
4. CF/LC difficulty ratings as first-class KT features

Baselines to beat: Rule-based → DKT only → Graph-DKT (proposed)
Metrics: AUC, Accuracy, Precision@K, Recall@K, NDCG@K