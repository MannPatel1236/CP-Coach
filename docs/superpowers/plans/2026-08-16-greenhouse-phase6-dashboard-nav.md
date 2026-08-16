# Greenhouse Phase 6 — Dashboard Navigation & View Segmentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the post-analysis dashboard from a single, 10+ card vertically stacked column into a 4-view navigation system (**Practice & Frontier**, **Analytics & Progress**, **Head-to-Head Compare**, **Workbook Planner**), keeping all sections **permanently mounted** with `.dash-panel[hidden] { display: none !important; }` and React 18 `inert={isActive ? undefined : ""}` to guarantee true zero-refetch, preserved Compare results, and instant sub-millisecond tab switching.

**Architecture:** A new sticky sub-navigation component `src/components/DashboardNav.jsx` renders immediately below `SearchBar` when `user` is non-null. The post-analysis main container in `App.jsx` renders four permanent `.dash-panel` containers (`practice`, `analytics`, `compare`, `workbook`), driving visibility through `hidden` + `inert`. URL hash synchronizes via `history.replaceState` (falling back to `practice` on unknown hashes, reset on `handleClear`).

**Standing Policy:** NO git push or Render deploy until the entire redesign program is complete.

---

## The Code-Level Traps & Exact Solutions

1. **CSS Specificity Override**: Author rule `.dashboard-layout { display: grid }` (src/index.css:310) beats user-agent `[hidden] { display: none }`.
   - **Fix**: Add `.dash-panel[hidden] { display: none !important; }` in `src/index.css`.
2. **React 18.2 `inert` Prop Quirk**: React 18 does not recognize `inert={boolean}` and logs console warnings.
   - **Fix**: Use string-presence prop `inert={isActive ? undefined : ""}` (renders HTML attribute `inert=""` when inactive, omits when active).
3. **No Duplicate `ProfileCard` in Analytics**:
   - **Fix**: Left column in `analytics` contains `SkillChart` only. `ProfileCard` stays exclusive to the `practice` sidebar.
4. **Practice Decision Pipeline Preserved**:
   - **Fix**: Explicit slotting in Practice right column: `SkillFrontier` $\to$ (`SuccessBanner` / `TopicPicker`) $\to$ `Recommendations` $\to$ `WhyThisRec` $\to$ `ModelInsight`.
5. **No Mutation of `useAnalysis.clearAll`**:
   - **Fix**: Leave `useAnalysis.js` untouched. In `App.jsx`, create `const handleClear = () => { clearAll(); switchTab("practice"); };` and pass to `useKeyboardShortcuts` (`onClear`) and `Header` (`onHome`). Also call `history.replaceState(null, "", "#practice")`.
6. **Sticky Sub-Nav Placement**:
   - **Fix**: `Header` is sticky at `top: 0` with height ~70px and `z-index: 30`. `DashboardNav` must stick at `top: 70px` with `z-index: 25` so it does not slide under the header on scroll.
7. **Scroll Restoration & ARIA Roles**:
   - **Fix**: In `switchTab`, call `window.scrollTo(0, 0)` so switching tabs doesn't land mid-page. Panels get `role="tabpanel"`, `id={`panel-${id}`}`, and `aria-labelledby={`tab-${id}`}` to complete the APG tab pattern.
8. **Instant Panel Switch + Nav Pill Animation**:
   - **Fix**: Zero panel exit animation (instant visibility toggle). Nav tab renders `<motion.span layoutId="active-nav-pill" className="dash-nav-pill" />` for the active indicator.
9. **Deterministic `AppTabs.test.jsx`**:
   - **Fix**: Mock `useAnalysis` with the full `baseContext` fixture (`src/__fixtures__/analysisContext.jsx`). Mock all 5 self-fetching endpoints (`/api/graph`, `/api/rating-trajectory`, `/api/mastery-history`, `/api/progress`, `/api/plans/*`). In tests, `await waitFor(() => expect(globalThis.fetch.mock.calls.length).toBe(5))` before recording baseline, then cycle tabs and assert 0 additional fetch calls.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/components/DashboardNav.jsx` | Create | Sticky WAI-ARIA tablist under search bar (`TargetIcon`, `TrendUpIcon`, `UserIcon`, `BookIcon`). Wrap-around arrow navigation, roving tabindex, `framer-motion` `layoutId="active-nav-pill"`. |
| `src/components/DashboardNav.test.jsx` | Create | Unit tests: 4 tabs with correct ARIA roles (`role="tab"`, `aria-selected`, `aria-controls`), arrow key navigation with wrap-around, hash cleanup between tests. |
| `src/App.jsx` | Modify | `activeTab` state synced via `history.replaceState`; 4 permanently mounted `.dash-panel` wrappers with `hidden={!isActive}`, `inert={isActive ? undefined : ""}`, `role="tabpanel"`, `aria-labelledby`; `handleClear` wrapper. |
| `src/AppTabs.test.jsx` | Create | Integration test: mocks `useAnalysis` + 5 fetch endpoints; asserts fetch count is identical before and after cycling all 4 tabs; asserts `hidden` and `inert` attributes. |
| `src/index.css` | Modify | `.dash-panel[hidden] { display: none !important; }`, `.dash-nav-*` styling (`top: 70px`, `z-index: 25`, mobile `overflow-x: auto`), `.dashboard-single-col` layout. |
| `CLAUDE.md` | Modify | Document `DashboardNav.jsx`, `DashboardNav.test.jsx`, and `AppTabs.test.jsx` in repo tree (Rule 10). |

---

## Step-by-Step Execution Plan

### Step 1: CSS Foundations (`src/index.css`)
- [x] Add `.dash-panel[hidden] { display: none !important; }`.
- [x] Add `.dash-nav-container`, `.dash-nav-list`, `.dash-nav-item`, `.dash-nav-pill` styles (`position: sticky; top: 70px; z-index: 25;`, mobile horizontal scroll with hidden scrollbar).
- [x] Add `.dashboard-single-col` for Compare and Workbook (max-width `var(--dash-max)`, margin `0 auto`, padding `24px 48px 80px`).

### Step 2: Create `DashboardNav.jsx` & `DashboardNav.test.jsx`
- [x] Implement `DashboardNav.jsx` with tabs:
  - `practice`: `Practice & Frontier` (`TargetIcon`)
  - `analytics`: `Analytics & Progress` (`TrendUpIcon`)
  - `compare`: `Compare` (`UserIcon`)
  - `workbook`: `Workbook` (`BookIcon`)
- [x] ARIA markup: `role="tablist"`, `role="tab"`, `id={`tab-${id}`}`, `aria-selected`, `aria-controls={`panel-${id}`}`, roving `tabIndex={isActive ? 0 : -1}`.
- [x] Keyboard handling: `ArrowLeft`, `ArrowRight`, `Home`, `End` (wrap-around focus + activation).
- [x] Active pill animation: `<motion.span layoutId="active-nav-pill" className="dash-nav-pill" />`.
- [x] Write `DashboardNav.test.jsx` with `beforeEach` hash/history reset.

### Step 3: Wire Tabs in `App.jsx`
- [x] Implement `sanitizeTab`: lowercase, trim `#`, fallback `"practice"` if not in `["practice", "analytics", "compare", "workbook"]`.
- [x] Read initial hash on mount.
- [x] Add `switchTab(tab)` helper: sets `activeTab`, calls `history.replaceState(null, "", "#" + tab)`, and calls `window.scrollTo(0, 0)`.
- [x] Listen to `window.addEventListener("hashchange", ...)` for browser back/forward.
- [x] Create `handleClear = () => { clearAll(); switchTab("practice"); }` and pass to `useKeyboardShortcuts` (`onClear`) and `Header` (`onHome`).
- [x] Render `<DashboardNav activeTab={activeTab} onSelectTab={switchTab} />` directly under `SearchBar` when `user` is non-null.
- [x] Render 4 permanent `.dash-panel` containers:
  - **`#panel-practice`** (`.dashboard-grid.dashboard-layout`):
    - Left: `ProfileCard(s)`, `WeakAreas`, `TagOverview`
    - Right: `SkillFrontier`, `SuccessBanner`, `TopicPicker`, `Recommendations`, `WhyThisRec`, `ModelInsight`
  - **`#panel-analytics`** (`.dashboard-grid.dashboard-layout`):
    - Left: `SkillChart`
    - Right: `RatingTrajectory`, `MasteryHistory`, `ActivityHeatmap`
  - **`#panel-compare`** (`.dashboard-single-col`):
    - `CompareHandles`
  - **`#panel-workbook`** (`.dashboard-single-col`):
    - `Workbook`
- [x] On all panels, attach `role="tabpanel"`, `id={`panel-${id}`}`, `aria-labelledby={`tab-${id}`}`, `hidden={activeTab !== id}`, and `inert={activeTab === id ? undefined : ""}`.

### Step 4: Create Integration Test `src/AppTabs.test.jsx`
- [x] Mock `useAnalysis` using `src/__fixtures__/analysisContext.jsx`.
- [x] Mock `global.fetch` for all 5 self-fetching endpoints (`/api/graph`, `/api/rating-trajectory`, `/api/mastery-history`, `/api/progress`, `/api/plans/*`).
- [x] In test: `render(<App />)`.
- [x] `await waitFor(() => expect(globalThis.fetch.mock.calls.length).toBe(5))`.
- [x] Record call count.
- [x] Click through `Analytics` $\to$ `Compare` $\to$ `Workbook` $\to$ `Practice`.
- [x] Assert `globalThis.fetch.mock.calls.length` remains exactly 5.
- [x] Assert inactive panels have `hidden` attribute and `inert=""`.

### Step 5: Verification & Merge
- [x] Run full frontend triplet: `npm run build && npm test && npm run lint`.
- [x] Run backend test suite: `cd backend && pytest tests/`.
- [x] Update `CLAUDE.md` repo tree (Rule 10).
- [x] Commit with clean message: `feat(greenhouse-6): dashboard navigation & view segmentation ...`.
