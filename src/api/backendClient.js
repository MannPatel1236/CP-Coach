const BASE = import.meta.env.VITE_API_URL || null;

async function apiFetch(path, signal, options = {}) {
  if (!BASE) throw new Error("VITE_API_URL not set");
  const res = await fetch(`${BASE}${path}`, { signal, ...options });
  if (!res.ok) {
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json() : await res.text();
    const detail = isJson && body.detail ? body.detail : body;
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  return res.json();
}

export const analyzeHandle = (handle, platform, mode, signal) =>
  apiFetch(`/api/analyze/${encodeURIComponent(handle)}?platform=${platform}&mode=${mode}`, signal);

export const getRecommendations = (handle, platforms, topK, signal, focusTopics = "") =>
  apiFetch(`/api/recommend/${encodeURIComponent(handle)}?platforms=${platforms}&top_k=${topK}&focus_topics=${encodeURIComponent(focusTopics)}`, signal);

export const getRecommendationsWithMastery = (handle, platforms, topK, signal, focusTopics = "", masteryScores = {}, solvedIds = [], userRating = null) =>
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
    }),
  });

export const getProgress = (handle, signal) =>
  apiFetch(`/api/progress/${encodeURIComponent(handle)}`, signal);

export const getTopicGraph = (signal) =>
  apiFetch(`/api/graph`, signal);
