const BASE = import.meta.env.VITE_API_URL || null;

// Retry budget sized for Render cold starts: the backend spins down when idle and
// answers 502/503 (or drops the socket) for ~30–60s while it boots. The old 1s/2s
// budget gave up after ~3s, fell through to the client-only rule-based path, and
// surfaced as the "estimate · not graph-dkt" badge — so the ceiling is patience,
// not error class. Delays escalate to a ~95s total budget; happy path is unchanged.
const RETRY_DELAYS_MS = [5000, 15000, 30000, 45000];
// Writes keep the original short budget: they are user-initiated and land after
// a read already warmed the instance, so a 5xx there is a real failure — waiting
// ~95s to report it just freezes the UI (and the save-plan contract says so).
const WRITE_RETRY_DELAYS_MS = [1000, 2000];

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fire-and-forget wake-up, called once at app boot (main.jsx): starts the
// cold-start boot while the user is still typing a handle instead of during the
// analyze request itself.
export const warmUpBackend = () => {
  if (!BASE) return;
  return fetch(`${BASE}/health`).catch(() => {});
};

async function apiFetch(path, signal, options = {}, attempt = 0) {
  if (!BASE) throw new Error("VITE_API_URL not set");
  try {
    const res = await fetch(`${BASE}${path}`, { signal, ...options });
    if (!res.ok) {
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const body = isJson ? await res.json() : await res.text();
      const detail = isJson && body.detail ? body.detail : body;
      throw new Error(`API error ${res.status}: ${detail}`);
    }
    return res.json();
  } catch (err) {
    // Never retry abort signals — the caller explicitly cancelled
    if (err.name === "AbortError") throw err;
    // Retry on network errors and 5xx status codes (cold-start 502/503/504 included)
    const retryDelays = options.method && options.method !== "GET" ? WRITE_RETRY_DELAYS_MS : RETRY_DELAYS_MS;
    if (attempt < retryDelays.length) {
      const isNetworkError = !err.message?.includes("API error");
      const isServerError = err.message?.match(/API error 5/);
      if (isNetworkError || isServerError) {
        await delay(retryDelays[attempt]);
        return apiFetch(path, signal, options, attempt + 1);
      }
    }
    throw err;
  }
}

export const analyzeHandle = (handle, platform, mode, signal) =>
  apiFetch(`/api/analyze/${encodeURIComponent(handle)}?platform=${platform}&mode=${mode}`, signal);

export const getRecommendations = (handle, platforms, topK, signal, focusTopics = "") =>
  apiFetch(`/api/recommend/${encodeURIComponent(handle)}?platforms=${platforms}&top_k=${topK}&focus_topics=${encodeURIComponent(focusTopics)}`, signal);

export const getRecommendationsWithMastery = (handle, platforms, topK, signal, focusTopics = "", masteryScores = {}, solvedIds = [], userRating = null, cfHandle = null, lcHandle = null) =>
  apiFetch(`/api/recommend/${encodeURIComponent(handle)}`, signal, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platforms,
      top_k: topK,
      focus_topics: focusTopics,
      mastery_scores: masteryScores,
      solved_ids: solvedIds,
      ...(userRating != null && { user_rating: userRating }),
      ...(cfHandle && { cf_handle: cfHandle }),
      ...(lcHandle && { lc_handle: lcHandle }),
    }),
  });

export const getProgress = (handle, signal, platform = "cf") =>
  apiFetch(`/api/progress/${encodeURIComponent(handle)}?platform=${platform}`, signal);

// Trajectory is CF-only by route contract (LC renders a disabled card client-side)
export const getRatingTrajectory = (handle, signal) =>
  apiFetch(`/api/rating-trajectory/${encodeURIComponent(handle)}?platform=cf`, signal);

export const getMasteryHistory = (handle, signal, platform = "cf") =>
  apiFetch(`/api/mastery-history/${encodeURIComponent(handle)}?platform=${platform}`, signal);

export const getTopicGraph = (signal) =>
  apiFetch(`/api/graph`, signal);

export const getPlans = (handle, signal) =>
  apiFetch(`/api/plans/${encodeURIComponent(handle)}`, signal);

export const createPlan = (handle, plan, signal) =>
  apiFetch(`/api/plans/${encodeURIComponent(handle)}`, signal, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });

export const updatePlan = (handle, id, plan, signal) =>
  apiFetch(`/api/plans/${encodeURIComponent(handle)}/${id}`, signal, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });

export const deletePlan = (handle, id, signal) =>
  apiFetch(`/api/plans/${encodeURIComponent(handle)}/${id}`, signal, { method: "DELETE" });
