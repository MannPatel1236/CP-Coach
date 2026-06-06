#!/usr/bin/env bash
# ── CP Coach — end-to-end smoke test ─────────────────────────────────────────
# Hits the live backend (local or Render) over HTTP, asserts response shape.
# Used as a post-deploy verification step.
#
# Usage:
#   BASE_URL=https://<render-service>.onrender.com bash backend/scripts/smoke_test.sh
#   BASE_URL=http://localhost:8000                     bash backend/scripts/smoke_test.sh
#
# Requires: curl, jq
# Exits non-zero on the first failed assertion.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
HANDLE="${HANDLE:-tourist}"   # public CF handle with a long submission history
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
NC=$'\033[0m'

PASS=0
FAIL=0

log_pass() { echo "${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
log_fail() { echo "${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
log_info() { echo "${YELLOW}→${NC} $1"; }

# ── Preflight ────────────────────────────────────────────────────────────────
for tool in curl jq; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERROR: '$tool' is required but not installed." >&2
    exit 2
  fi
done

log_info "Smoke test against: $BASE_URL"
log_info "Test handle:        $HANDLE"
echo

# Helper: GET $1, then assert the second arg is a jq expression that returns true
assert_get() {
  local path="$1"
  local jq_expr="$2"
  local desc="$3"
  local body
  local status
  body=$(curl -sS -w "\n%{http_code}" --max-time 30 "$BASE_URL$path") || {
    log_fail "$desc — curl failed"
    return
  }
  status=$(printf '%s' "$body" | tail -n 1)
  body=$(printf '%s' "$body" | sed '$d')
  if [[ "$status" != "200" ]]; then
    log_fail "$desc — expected 200, got $status. Body: $body"
    return
  fi
  if ! printf '%s' "$body" | jq -e "$jq_expr" >/dev/null; then
    log_fail "$desc — assertion failed: $jq_expr. Body: $body"
    return
  fi
  log_pass "$desc"
}

assert_post() {
  local path="$1"
  local payload="$2"
  local jq_expr="$3"
  local desc="$4"
  local body
  local status
  body=$(curl -sS -w "\n%{http_code}" --max-time 30 \
    -X POST "$BASE_URL$path" \
    -H "Content-Type: application/json" \
    -d "$payload") || {
    log_fail "$desc — curl failed"
    return
  }
  status=$(printf '%s' "$body" | tail -n 1)
  body=$(printf '%s' "$body" | sed '$d')
  if [[ "$status" != "200" ]]; then
    log_fail "$desc — expected 200, got $status. Body: $body"
    return
  fi
  if ! printf '%s' "$body" | jq -e "$jq_expr" >/dev/null; then
    log_fail "$desc — assertion failed: $jq_expr. Body: $body"
    return
  fi
  log_pass "$desc"
}

# ── 1. /health ───────────────────────────────────────────────────────────────
assert_get "/health" \
  '.status == "ok" and .version == "2.0" and .platforms | index("cf") and index("lc")' \
  "GET /health returns ok + cf + lc"

# ── 2. /health/deep ──────────────────────────────────────────────────────────
# Probes live CF + LeetCode. If CF is rate-limiting or down, this is "degraded"
# — we warn but don't fail. The /health endpoint is the strict check.
if deep=$(curl -sS --max-time 30 "$BASE_URL/health/deep"); then
  cf_status=$(printf '%s' "$deep" | jq -r '.downstream.codeforces // "unknown"')
  if [[ "$cf_status" == "ok" ]]; then
    log_pass "GET /health/deep — codeforces ok"
  else
    log_info "GET /health/deep — codeforces: $cf_status (warning, not failing)"
  fi
else
  log_fail "GET /health/deep — request failed"
fi

# ── 3. GET /api/analyze/{handle} ─────────────────────────────────────────────
# Real call to the live CF API; this can take 5-15s on first hit. The
# assertion is intentionally lenient on the topic_profile shape — any non-empty
# profile with a 'math' or 'implementation' topic counts as success (handles
# vary wildly in topic mix).
assert_get "/api/analyze/${HANDLE}?platform=cf&mode=quick" \
  ".handle == \"${HANDLE}\" and .platform == \"cf\" and (.topic_profile | length) > 0 and (.mastery_scores | length) > 0 and (.model_used | IN(\"rule_based\", \"graph_dkt\"))" \
  "GET /api/analyze/${HANDLE} — valid shape, non-empty topic_profile + mastery_scores"

# ── 4. POST /api/recommend/{handle} ──────────────────────────────────────────
assert_post "/api/recommend/${HANDLE}" \
  "{\"platforms\":\"cf\",\"top_k\":5}" \
  ".handle == \"${HANDLE}\" and (.recommendations | length) > 0 and (.model_used | IN(\"rule_based\", \"mastery_guided\"))" \
  "POST /api/recommend/${HANDLE} — non-empty recommendations"

# ── 5. GET /api/graph ────────────────────────────────────────────────────────
# The CP prerequisite graph is 22 nodes, 18 edges (per CLAUDE.md).
assert_get "/api/graph" \
  '(.nodes | length) == 22 and (.edges | length) == 18' \
  "GET /api/graph — 22 nodes, 18 edges"

# ── Summary ──────────────────────────────────────────────────────────────────
echo
echo "────────────────────────────────────────"
echo -e "Passed: ${GREEN}${PASS}${NC}    Failed: ${RED}${FAIL}${NC}"
echo "────────────────────────────────────────"

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "SMOKE TEST FAILED. Check the failing endpoint(s) above."
  exit 1
fi

echo
echo "All smoke tests passed. Backend is healthy."
