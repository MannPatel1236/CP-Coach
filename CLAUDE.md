# CLAUDE.md — CP Coach
# Graph-Augmented Knowledge Tracing for Personalized Competitive Programming Training
# READ THIS ENTIRE FILE BEFORE TOUCHING ANY FILE.

---

## Project overview

CP Coach is a personalized competitive programming analytics and training web app.
Research project targeting AIED / EDM / ECML-PKDD.

Research title: "Graph-Augmented Knowledge Tracing for Personalized Competitive Programming Training"
Base paper: KSAP — Wang et al., Springer KAIS, 2025
Deployed at: https://cp-coach.vercel.app
Platforms supported: Codeforces (CF) + LeetCode (LC)

---

## ACTUAL repo structure (do not invent paths)

```
CP-Coach/                        ← repo root
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
│       ├── Header.jsx
│       ├── SearchBar.jsx        ← handle input + quick/deep + platform toggle
│       ├── LandingPage.jsx
│       ├── ProfileCard.jsx      ← uses rankColor, ratingColor from utils.js
│       ├── WeakAreas.jsx        ← uses acColor from utils.js
│       ├── TagOverview.jsx
│       ├── SkillChart.jsx       ← recharts bar/radar toggle
│       ├── TopicPicker.jsx
│       ├── Recommendations.jsx  ← uses diffColor from utils.js
│       ├── SuccessBanner.jsx
│       ├── LoadingState.jsx
│       ├── ErrorState.jsx
│       └── Icons.jsx
├── api/
│   └── cf.js                    ← Vercel serverless CORS proxy (working, do not touch)
├── backend/
│   ├── __init__.py
│   ├── main.py                  ← FastAPI app, CORS, lifespan, routers, health check
│   ├── Dockerfile               ← Python 3.11-slim + torch CPU + PyG
│   ├── startup.sh               ← Wait for PG, apply schema, start uvicorn
│   ├── README.md                ← Dev/Docker/Training/API docs
│   ├── .env.example
│   ├── .gitignore
│   ├── requirements.txt
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── analyze.py           ← GET /api/analyze/{handle}
│   │   ├── recommend.py         ← GET /api/recommend/{handle}
│   │   ├── progress.py          ← GET /api/progress/{handle}
│   │   └── graph.py             ← GET /api/graph
│   ├── platforms/
│   │   ├── __init__.py
│   │   ├── codeforces.py        ← CF REST API client
│   │   ├── leetcode.py          ← LeetCode GraphQL client
│   │   └── normalizer.py        ← converts CF + LC data → normalized format
│   ├── models/
│   │   ├── __init__.py
│   │   ├── dkt.py               ← DKT LSTM backbone
│   │   ├── graph_dkt.py         ← Graph-augmented DKT (research contribution)
│   │   └── recommender.py       ← Recommendation engine with prerequisite gating
│   ├── data/
│   │   ├── __init__.py
│   │   ├── preprocessor.py      ← Feature engineering + recency decay
│   │   └── topic_graph.py       ← CPTopicGraph (22 topics, 18 edges)
│   ├── db/
│   │   ├── __init__.py
│   │   ├── schema.sql           ← PostgreSQL schema + seed data
│   │   └── connection.py        ← SQLAlchemy async engine + ORM models
│   ├── training/
│   │   ├── __init__.py
│   │   ├── train_dkt.py         ← CLI training script
│   │   └── evaluate.py          ← AUC/accuracy/per-topic evaluation
│   └── weights/
│       └── .gitkeep
├── docker-compose.yml           ← backend + postgres + adminer
├── pyrightconfig.json           ← IDE Python source root config
├── .env.example                 ← Frontend env template (VITE_API_URL)
├── index.html
├── package.json                 ← deps: react, react-dom, recharts, framer-motion (NO axios)
├── vite.config.js               ← /cf-api proxy for dev
└── vercel.json                  ← /api/cf/:path* rewrite
```

---

## Non-negotiable rules

1. SURGICAL EDITS ONLY — minimum lines changed, never refactor working code
2. NEVER touch utils.js — CF semantic colors carry official meaning, breaking them breaks the product
3. NEVER touch index.css — CSS variable system is load-bearing
4. NO axios — project uses native fetch() only
5. NO placeholder stubs — every function must be fully implemented
6. NO hardcoded secrets — all keys and URLs go in .env files
7. Backend goes in backend/ — never mix Python files into src/
8. Multi-platform data normalizes to a shared format BEFORE entering any shared logic
9. Test every prompt before moving to the next one
10. CF existing functionality must never break — LeetCode is additive only
11. If any file is moved, renamed, or created, update the 'ACTUAL repo structure' section in CLAUDE.md immediately before ending the turn.

---

## Current data flow (Phase 1 — working, do not break)

```
handle → useAnalysis.analyze()
  → fetchUserInfo()        [src/api.js → /api/cf/user.info]
  → fetchSubmissions()     [src/api.js → /api/cf/user.status, paginated up to 8000]
  → buildTagProfile()      [src/api.js — recency-weighted, pure function]
  → findWeakTags()         [src/api.js — threshold 65% acRate]
  → fetchProblemsForTags() [src/api.js → /api/cf/problemset.problems]
  → buildRecommendations() [src/api.js — difficulty band ±350, stretch fallback ±600]
  → useRecommendations state → Recommendations component
```

Recency decay formula — REPLICATE EXACTLY in backend:
  weight = 1.0 - (0.8 * idx) / Math.max(total - 1, 1)
  idx=0 = most recent submission → weight=1.0
  idx=total-1 = oldest → weight=0.2

---

## Multi-platform: Codeforces + LeetCode

### Codeforces (existing, working)
- Public REST API: https://codeforces.com/api
- No auth required
- Endpoints used: /user.info, /user.status, /problemset.problems

### LeetCode (new, verified working)
- GraphQL endpoint: https://leetcode.com/graphql
- No auth, no API key required
- Must be called SERVER-SIDE from FastAPI (CORS blocks browser calls)
- Required headers: Content-Type: application/json, Referer: https://leetcode.com

Verified working GraphQL queries:

  1. User profile + solve counts:
  query getUserProfile($username: String!) {
    matchedUser(username: $username) {
      username
      submitStats {
        acSubmissionNum { difficulty count submissions }
      }
    }
  }

  2. Recent submissions (up to 50):
  query getRecentSubmissions($username: String!, $limit: Int) {
    recentSubmissionList(username: $username, limit: $limit) {
      title titleSlug timestamp statusDisplay lang
    }
  }

  3. Problem details + topic tags (call per unique titleSlug):
  query getProblemDetails($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      title difficulty
      topicTags { name slug }
    }
  }

  4. Contest ranking:
  query getUserContestRanking($username: String!) {
    userContestRanking(username: $username) {
      attendedContestsCount rating globalRanking
    }
  }

LeetCode difficulty → numeric rating mapping:
  Easy → 800-1100, Medium → 1200-1500, Hard → 1600-2000

### Normalized submission format (BOTH platforms convert to this)
```python
{
  "problem_id": str,     # "cf-1234A" or "lc-two-sum"
  "platform": str,       # "cf" or "lc"
  "verdict": str,        # "OK" | "WRONG_ANSWER" | "OTHER"
  "topics": list[str],   # normalized internal topic names (see maps below)
  "difficulty": int,     # numeric 800–3500
  "timestamp": int,      # unix milliseconds
}
```

---

## Topic normalization maps

Internal topic names (22 canonical names):
```
implementation, math, greedy, constructive_algorithms, binary_search,
two_pointers, sortings, strings, number_theory, combinatorics,
dfs_and_similar, graphs, trees, dp, dp_on_trees, data_structures,
bitmasks, divide_and_conquer, hashing, geometry, flows, brute_force
```

CF tag → internal name:
```python
CF_TAG_MAP = {
  "dfs and similar": "dfs_and_similar",
  "constructive algorithms": "constructive_algorithms",
  "binary search": "binary_search",
  "two pointers": "two_pointers",
  "number theory": "number_theory",
  "data structures": "data_structures",
  "divide and conquer": "divide_and_conquer",
  "brute force": "brute_force",
  "dynamic programming": "dp",
  # all others: tag.lower().replace(" ", "_")
}
```

LeetCode slug → internal name:
```python
LC_TAG_MAP = {
  "array": "implementation",
  "hash-table": "hashing",
  "dynamic-programming": "dp",
  "math": "math",
  "string": "strings",
  "binary-search": "binary_search",
  "greedy": "greedy",
  "depth-first-search": "dfs_and_similar",
  "breadth-first-search": "dfs_and_similar",
  "graph": "graphs",
  "tree": "trees",
  "sorting": "sortings",
  "two-pointers": "two_pointers",
  "divide-and-conquer": "divide_and_conquer",
  "bit-manipulation": "bitmasks",
  "combinatorics": "combinatorics",
  "number-theory": "number_theory",
  "geometry": "geometry",
  "union-find": "data_structures",
  "heap-priority-queue": "data_structures",
  "stack": "data_structures",
  "queue": "data_structures",
  "linked-list": "data_structures",
  "trie": "data_structures",
  "segment-tree": "data_structures",
  "binary-indexed-tree": "data_structures",
}
```

---

## Backend architecture

```
backend/
├── main.py                  ← FastAPI app, CORS, routers, health check
├── routes/
│   ├── analyze.py           ← GET /api/analyze/{handle}?platform=cf|lc&mode=quick|deep
│   ├── recommend.py         ← GET /api/recommend/{handle}?platforms=cf,lc&top_k=20
│   ├── progress.py          ← GET /api/progress/{handle}
│   └── graph.py             ← GET /api/graph
├── platforms/
│   ├── codeforces.py        ← CF REST API client (httpx async)
│   ├── leetcode.py          ← LeetCode GraphQL client (httpx async)
│   └── normalizer.py        ← converts CF + LC data → normalized submission format
├── models/
│   ├── dkt.py               ← DKT LSTM backbone (PyTorch)
│   ├── graph_dkt.py         ← Graph-augmented DKT (PyTorch + PyTorch Geometric)
│   └── recommender.py       ← Recommendation engine
├── data/
│   ├── preprocessor.py      ← Feature engineering, recency decay
│   └── topic_graph.py       ← CPTopicGraph: nodes, edges, PyG edge_index
├── db/
│   ├── schema.sql           ← PostgreSQL schema + topic_graph seed data
│   └── connection.py        ← SQLAlchemy async engine + ORM models
├── training/
│   ├── train_dkt.py         ← CLI training script
│   └── evaluate.py          ← AUC, accuracy, per-topic evaluation
├── weights/                 ← gitignored, model weights live here
├── requirements.txt
└── .env.example
```

---

## Graph-DKT model spec (core research contribution)

```
Input: x_t = (topic_id, solved: 0|1, difficulty: 0-1 normalized, timestamp_delta: normalized)

STEP 1 — DKT Backbone (LSTM)
  embedding: Embedding(num_topics, 64)
  input_proj: Linear(67, 128)        # 64 + solved + difficulty + ts_delta
  lstm: LSTM(128, 128, layers=1, dropout=0.2, batch_first=True)
  output: Linear(128, num_topics) → Sigmoid

STEP 2 — GCN Graph Layer (PyTorch Geometric GCNConv)
  gcn1: GCNConv(128, 64) → ReLU
  gcn2: GCNConv(64, 64)
  edge_index: from CPTopicGraph, registered as buffer (not a parameter)
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
math → greedy
math → constructive_algorithms
greedy → binary_search
binary_search → data_structures
data_structures → trees
data_structures → graphs
trees → dfs_and_similar
graphs → dfs_and_similar
dfs_and_similar → dp
dp → dp_on_trees
greedy → dp
math → number_theory
number_theory → combinatorics
binary_search → sortings
sortings → data_structures
math → two_pointers
two_pointers → binary_search
```

---

## Database schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  cf_handle VARCHAR(50),
  lc_handle VARCHAR(50),
  primary_platform VARCHAR(5) DEFAULT 'cf',
  last_synced TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS problems (
  problem_id VARCHAR(60) PRIMARY KEY,
  platform VARCHAR(5),
  name TEXT,
  difficulty INTEGER,
  topics TEXT[],
  solve_count INTEGER,
  url TEXT
);

CREATE TABLE IF NOT EXISTS topic_graph (
  from_topic VARCHAR(50),
  to_topic VARCHAR(50),
  weight FLOAT DEFAULT 1.0,
  PRIMARY KEY (from_topic, to_topic)
);

CREATE TABLE IF NOT EXISTS kt_states (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  topic VARCHAR(50),
  p_mastery FLOAT,
  updated_at TIMESTAMP,
  PRIMARY KEY (user_id, topic)
);
```

---

## CF semantic colors (utils.js) — MUST NEVER CHANGE KEEP IT AS IT IS

```
acColor:   red (#ef4444) < 40% | amber (#f59e0b) < 65% | green (#22c55e) >= 65%
rankColor: newbie #808080 | pupil #008000 | specialist #03a89e | expert #0000ff
           candidate master #aa00aa | master/intl master #ff8c00 | grandmaster #ff0000
diffColor: tiered by rating 0/1200/1400/1600/1900/2100/2400+
ratingColor: same tier text colors
```

---

## FastAPI endpoints

```
GET  /api/analyze/{handle}?platform=cf|lc&mode=quick|deep
GET  /api/recommend/{handle}?platforms=cf,lc&top_k=20&focus_topics=dp,graphs
POST /api/recommend/{handle}  (body: {platforms, top_k, focus_topics, mastery_scores, solved_ids, user_rating})
GET  /api/progress/{handle}?platform=cf|lc
GET  /api/graph
POST /api/sync/{handle}?platform=cf|lc
GET  /health
```

Both GET and POST /api/recommend return `model_used: "rule_based" | "graph_dkt"`.
POST uses Graph-DKT when `mastery_scores` is non-empty; falls back to rule-based otherwise.

---

## Research contribution summary

Novel claims for the paper:
1. First application of KT to competitive programming
2. Directed prerequisite graph for CP topics (not co-occurrence based)
3. Cross-platform skill normalization: CF + LeetCode → unified topic taxonomy
4. CF/LC difficulty ratings as first-class KT features

Baselines to beat in evaluation:
  Rule-based (current system) → DKT only (no graph) → Graph-DKT (proposed)

Metrics: AUC, Accuracy, Precision@K, Recall@K, NDCG@K
