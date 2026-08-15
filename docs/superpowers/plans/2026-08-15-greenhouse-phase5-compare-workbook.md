# Greenhouse Phase 5 — Compare (two handles) · Workbook (saved plans)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the two §11 Phase-5 rows of the Greenhouse spec (`docs/superpowers/specs/2026-08-01-greenhouse-redesign-design.md`) — the last coding phases of the redesign. `CompareHandles` (row 5a) is frontend-only (`useCompareHandle`, zero new backend endpoints); `Workbook` (row 5b) introduces the **only DB change in the whole program** (the `plans` table + CRUD) with localStorage-first seeding. **Per owner directive: NO push/deploy until the full redesign is done — the Render smoke checklist stays at the very end of the program.**

**Architecture:** Two new dashboard sections render in App.jsx column 2 at the **bottom** (after `ModelInsight`) — Compare reads the primary handle from `AnalysisContext` and analyzes a secondary handle in a **localized** `useCompareHandle` hook (never touches primary context, per spec §4/§8); Workbook reads current recommendations/mastery from context and persists saved-plan checklists through a `plans` CRUD route with a localStorage-first seed/fallback per §5.2 #9. No charting library — hand-built CSS/SVG primitives (§13.3).

**Locked decisions (this session):**
1. **Compare secondary platform** — derived from the primary: `cf`-only primary → analyze secondary as `cf`; `lc`-only → `lc`; combined primary → user-selectable `cf`/`lc` toggle, default `cf`.
2. **Compare requires the backend** (`VITE_API_URL`): it reuses `analyzeHandle` (existing endpoint). No-backend env → disabled card + caption "Compare requires the backend service."
3. **Placement** — both sections append **after `ModelInsight`** at the bottom of column 2 (new slots, zero restructuring of the existing SkillChart→WhyThisRec stack, so Recommendations stays above the fold).
4. **plans CRUD is unauthenticated, handle-keyed** — matches the analyze/recommend read surface. HMAC (`verify_hmac`) stays GDPR-delete-only (`user.py`); the frontend cannot sign requests (no secret), so app-facing writes must be open. Auth is a future spec (§13 #4).
5. **Write-side DB failure → HTTP 502** (frontend keeps the optimistic localStorage copy + toast, never silently loses data); **read-side DB failure → `[]`** (frontend falls back to localStorage per §5.2 #9). No DB row + no localStorage → blank checklist state, never an error.
6. **localStorage key:** `cpcoach.plans.{handle}`.
7. **Workbook payload schema** (`plans.payload` JSONB): `{items: [{problem_id, name, platform, difficulty, topics, url, done}], focus_topics: [...], mastery_snapshot: {...}, saved_at: "<ISO>"}`.
8. **"Mastery polish" (§3 item 5) is NOT a §11 row** — deferred. The `mastery_snapshot` inside the plan payload (reproducibility "as of date") is the only polish-adjacent piece in 5b.

## Global constraints (from locked spec + CLAUDE.md)

- **Spec §5.2 #8:** Compare fallback — either handle fails to analyze → show the resolved side + **"second handle unavailable" chip**; rule_based mastery on either side is badged per §8 **before** diff coloring. Never a crash, never an infinite skeleton.
- **Spec §5.2 #9:** Workbook fallback — no DB row → seeded from localStorage; no localStorage → blank checklist state, never an error.
- **Spec §8:** `model_used !== "graph_dkt"` on either Compare side → "estimate (not Graph-DKT)" badge. Network → existing retry discipline (apiFetch retries 5xx/network ×2 with backoff); section-local failure → sealed empty-state + retry; toasts on write failure; `prefers-reduced-motion` → static final frame.
- **Spec §9:** every viz has a sibling text summary; nothing image-only.
- **Spec §4:** `useAnalysis` stays the single source for the primary handle — Compare's secondary lives only inside `useCompareHandle` (localized state, same abort discipline, never in primary context).
- **Spec §14:** the plan may not reopen §3 locks.
- **CLAUDE.md Rules:** (1) surgical edits; (2) never touch `utils.js`; (3) `index.css` token *names* stable, new tokens/classes additive; (4) no axios; (5) no stubs; (8) CF functionality never breaks; (10) **update the CLAUDE.md repo tree per task**; (13) **no Co-Authored-By lines**. Commit messages: `feat(greenhouse-5X): …` / `test(greenhouse-5X): …`.
- **CI-faithful gates:** backend `ruff check .` → `pyright` → `python -m py_compile …` → `python -m pytest tests/` (from `backend/`); frontend triplet from repo root `npm run build && npm test && npm run lint`. The ci.yml compile-check hardcodes a file list and **must gain `routes/plans.py`** (Task 5b).
- **Test infra facts:** backend tests run without `DATABASE_URL` — plans CRUD tests must **monkeypatch `routes.plans.AsyncSessionLocal` with an in-memory fake session** (never real DB); frontend tests use `renderInContext` from `src/__fixtures__/analysisContext.jsx`, file-scope fetch mocks, no jest-dom matchers. The `react-hooks/set-state-in-effect` lint rule bans synchronous setState in effects → self-fetching components use the async IIFE + `cancelled` flag pattern (mirror `RatingTrajectory.jsx`). `apiFetch` retries network errors/5xx twice with backoff → error-state tests must mock a **non-retryable 400-style response** (`{ok:false, headers:{get:()=>"application/json"}, json:()=>Promise.resolve({detail:"…"})}`), never `mockRejectedValue`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/hooks/useCompareHandle.js` | Create | Localized secondary-handle hook: own AbortController, `analyzeHandle` reuse, extracts `{user, mastery, solvedSet, modelUsed}`. |
| `src/components/CompareHandles.jsx` + `.test.jsx` | Create | Two-handle diff: mastery-delta bars + solved exclusives; "second handle unavailable" chip; §8 estimate badge; sibling summary. |
| `src/components/Workbook.jsx` + `.test.jsx` | Create | Saved-plan checklist section; save-current-recs, rename, delete, done-toggles; localStorage-first. |
| `src/lib/workbookStore.js` | Create | localStorage read/write helpers keyed `cpcoach.plans.{handle}`. |
| `src/api/backendClient.js` | Modify | `getPlans`, `createPlan`, `updatePlan`, `deletePlan`. |
| `src/App.jsx` | Modify | Render `CompareHandles` + `Workbook` after `ModelInsight` (bottom of column 2). |
| `src/index.css` | Modify (additive) | `.dash-compare-*`, `.dash-workbook-*` class families (incl. `.btn-primary` blocks mirroring `.dash-traj`). |
| `backend/db/schema.sql` | Modify | `plans` table + RLS policy. |
| `backend/db/connection.py` | Modify | `Plan` ORM model (JSONB payload). |
| `backend/routes/plans.py` | Create | `GET/POST /api/plans/{handle}`, `PUT/DELETE /api/plans/{handle}/{plan_id}`. |
| `backend/routes/schemas.py` | Modify | `PlanIn`, `PlanOut`. |
| `backend/main.py` | Modify | Register plans router. |
| `.github/workflows/ci.yml` | Modify | Compile-check list + `routes/plans.py`. |
| `backend/tests/test_plans.py` | Create | CRUD + 404s + idempotent POST + DB-failure paths via fake session. |
| `CLAUDE.md` | Modify | Tree updates per task (Rule 10). |

---

## Task 5a — CompareHandles (row #8, 0 new endpoints)

- [x] **Step 1:** Create `src/hooks/useCompareHandle.js` — localized hook, mirrors `useAnalysis` abort discipline: own `AbortController` in `abortRef`; `run(handle, platform, mode)` = `resetAbort()` then `analyzeHandle(handle, platform, mode, signal)` (reuses `backendClient.js` — **no new client fn**); extract `{user: {handle, rating, rank, platform}, mastery: data.mastery_scores || {}, solvedSet: new Set(flatten topic_profile[].solved_problems), modelUsed: data.model_used || "rule_based"}`; AbortError → silent; other error → `setError(message)`; unmount/target-change cleanup aborts in-flight. State: `{target, result, loading, error}`.
- [x] **Step 2:** Create `src/components/CompareHandles.jsx` — reads primary from context (`cfHandle, lcHandle, cfUser, lcUser, user, masteryScoresRef, solvedSet, modelUsed`). Header (icon chip + "Compare" heading, mirror RatingTrajectory header pattern). Platform derivation per lock #1; `!VITE_API_URL` (or `import.meta.env.VITE_API_URL` absent) → disabled card + caption. Secondary input + analyze button; loading skeleton; error → **"second handle unavailable" chip** while the resolved primary side still renders (spec §5.2 #8 fallback). When both resolved:
  - **Mastery delta bars** — topics with `|secondary − primary| > 0` and present on both sides, sorted by `|Δ|` desc; horizontal bar width ∝ `|Δ|`; mono value `+0.12/−0.08`; up (Δ>0) → `--success`, down → `--error`; `.dash-compare-*` classes.
  - **Solved exclusives** — A-only count + B-only count, each with up to 5 mono problem ids (then "+N more").
  - **§8 badge** — `modelUsed !== "graph_dkt"` on EITHER side → `data-testid="compare-estimate-badge"` "estimate · not graph-dkt".
  - **§9 sibling summary** — "`{A}` leads on {N} topics by ≥0.05, `{B}` leads on {M}; `{A}` solved {K} problems `{B}` hasn't, `{B}` solved {J} `{A}` hasn't."
  - Empty secondary target → prompt text, no fetch.
- [x] **Step 3:** Create `CompareHandles.test.jsx` — file-scope fetch mock returning analyzeHandle shapes. Cases: (a) both resolved → delta bars + summary present; (b) secondary fetch returns non-retryable 400 → "second handle unavailable" chip + primary side present; (c) secondary `model_used: "rule_based"` → estimate badge; (d) no secondary target → prompt, fetch not called. Use `renderInContext(<CompareHandles />)` (fixture primary = mannpatel, cf).
- [x] **Step 4:** `App.jsx` — render `{user && <CompareHandles />}` after `ModelInsight`; `index.css` `.dash-compare*` + `.btn-primary` block.
- [x] **Step 5:** Frontend triplet green; CLAUDE.md tree update; commit `feat(greenhouse-5a): …`.

## Task 5b — Workbook (row #9, `plans` table + CRUD)

- [x] **Step 1:** `schema.sql` — `plans (id BIGSERIAL PK, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(120) NOT NULL, payload JSONB NOT NULL, created_at TIMESTAMP DEFAULT now(), updated_at TIMESTAMP DEFAULT now())` (exact spec §7 SQL) + `ENABLE ROW LEVEL SECURITY` + permissive policy (mirror existing tables).
- [x] **Step 2:** `connection.py` — `Plan` ORM (mirror `RatingTrajectory` shape: id, user_id FK, name, payload JSONB, created_at/updated_at TIMESTAMP).
- [x] **Step 3:** `schemas.py` — `PlanIn {name: str, payload: dict}`; `PlanOut {id: int, name: str, payload: dict, created_at: str | None, updated_at: str | None}`.
- [x] **Step 4:** Create `backend/routes/plans.py` — `router = APIRouter(prefix="/api", tags=["plans"])`, all `@limiter.limit("30/minute")`, `verify_handle_signature` on all (mirror user.py handle-check), **no HMAC** (lock #4). User lookup by `(User.cf_handle.ilike(h)) | (User.lc_handle.ilike(h))`, create user row if missing (mirror `_persist_activity_weeks`). Writes set `Cache-Control: no-store`.
  - `GET /api/plans/{handle}` → `list[PlanOut]` ordered by `updated_at DESC`; no user → `[]`; DB failure → `[]` + warning (read-side fallback, lock #5).
  - `POST /api/plans/{handle}` → create, return `PlanOut`; DB failure → `HTTPException(502, "plans storage unavailable")` (write-side, lock #5). Idempotent: re-POST creates a new plan (keyed by `id`); no `(user, source, submission_id)` semantics apply here.
  - `PUT /api/plans/{handle}/{plan_id}` → update name/payload + `updated_at=now()`; missing plan → 404.
  - `DELETE /api/plans/{handle}/{plan_id}` → missing plan → 404; success → `{"deleted": true}`.
- [x] **Step 5:** `main.py` include plans router; `ci.yml` compile list + `routes/plans.py`.
- [x] **Step 6:** Create `backend/tests/test_plans.py` — in-memory fake `AsyncSessionLocal` (dict-backed) monkeypatched onto `routes.plans`; tests: GET empty → `[]`; POST → created with name/payload; GET lists newest-first; PUT updates; DELETE removes; PUT/DELETE unknown id → 404; POST when fake raises → 502; GET when fake raises → `[]`; handle-not-found GET → `[]`. Backend gate green (`ruff` → `pyright` → `py_compile` incl. plans.py → `pytest`).
- [x] **Step 7:** `backendClient.js` — `getPlans(handle, signal)`, `createPlan(handle, {name, payload}, signal)` (POST), `updatePlan(handle, id, {name, payload}, signal)` (PUT), `deletePlan(handle, id, signal)`.
- [x] **Step 8:** Create `src/lib/workbookStore.js` — `loadLocal(handle)` / `saveLocal(handle, plans)` over `localStorage` key `cpcoach.plans.{handle}` (JSON, try/catch).
- [x] **Step 9:** Create `src/components/Workbook.jsx` — reads context (`recommendations, weakTags, masteryScoresRef, cfHandle, lcHandle, user`). Load: `getPlans(handle)` → on `[]`/failure seed from `loadLocal(handle)` → blank checklist state (never error). Actions:
  - **Save current recommendations** → builds payload (lock #7) from context recs + `weakTags` focus + `masteryScoresRef.current` snapshot; optimistic `saveLocal` then `createPlan`; POST failure → toast, keep local (lock #5).
  - Per plan: expandable checklist (`done` checkbox toggles → `saveLocal` + `updatePlan` with updated payload), inline rename, delete (DELETE + remove local). §9 sibling summary — "N saved plan(s) for {handle}". No fetch when `!user` (App gating covers it).
- [x] **Step 10:** Create `Workbook.test.jsx` — fetch mocks: (a) GET returns 2 plans → list renders with names; (b) GET `[]` + empty localStorage → blank state caption; (c) Save button → POST body contains `items` from fixture recommendations + `focus_topics` + `mastery_snapshot`; (d) GET fails + pre-seeded localStorage → seeded list renders; (e) checkbox toggle → PUT called + localStorage updated.
- [x] **Step 11:** `App.jsx` — render `{user && <Workbook />}` after `CompareHandles`; `index.css` `.dash-workbook*` + `.btn-primary` block.
- [x] **Step 12:** Frontend triplet green; CLAUDE.md tree update; commit `feat(greenhouse-5b): …`.

---

## Done gate (whole phase)

- Backend: `ruff check .` → `pyright` → `python -m py_compile main.py routes/*.py` → `python -m pytest tests/` (from `backend/`).
- Frontend: `npm run build && npm test && npm run lint` (repo root).
- CLAUDE.md tree reflects all new files (Rule 10) — `useCompareHandle.js`, `CompareHandles.jsx`(+test), `Workbook.jsx`(+test), `workbookStore.js`, `routes/plans.py`, `test_plans.py`, `Plan` ORM, `plans` table.
- **No git push / no Render deploy** — owner directive: push only after the FULL redesign is complete. The Render smoke checklist (`/health` model_loaded, analyze model_used, plans CRUD round-trip) is the final manual step of the whole program.