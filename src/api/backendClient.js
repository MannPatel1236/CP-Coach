const BASE = import.meta.env.VITE_API_URL || null;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

async function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
    // Retry on network errors and 5xx status codes
    if (attempt < MAX_RETRIES) {
      const isNetworkError = !err.message?.includes("API error");
      const isServerError = err.message?.match(/API error 5/);
      if (isNetworkError || isServerError) {
        await delay(RETRY_DELAY_MS * (attempt + 1));
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

export const getProgress = (handle, signal) =>
  apiFetch(`/api/progress/${encodeURIComponent(handle)}`, signal);

export const getTopicGraph = (signal) =>
  apiFetch(`/api/graph`, signal);
