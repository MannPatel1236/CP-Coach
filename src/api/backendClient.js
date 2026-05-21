const BASE = import.meta.env.VITE_API_URL || null;

async function apiFetch(path, signal, options = {}) {
  if (!BASE) throw new Error("VITE_API_URL not set");
  const res = await fetch(`${BASE}${path}`, { signal, ...options });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export const analyzeHandle = (handle, platform, mode, signal) =>
  apiFetch(`/api/analyze/${handle}?platform=${platform}&mode=${mode}`, signal);

export const getRecommendations = (handle, platforms, topK, signal, focusTopics = "") =>
  apiFetch(`/api/recommend/${handle}?platforms=${platforms}&top_k=${topK}&focus_topics=${encodeURIComponent(focusTopics)}`, signal);

export const getRecommendationsWithMastery = (handle, platforms, topK, signal, focusTopics = "", masteryScores = {}, solvedIds = [], userRating = null) =>
  apiFetch(`/api/recommend/${handle}`, signal, {
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
  apiFetch(`/api/progress/${handle}`, signal);

export const getTopicGraph = (signal) =>
  apiFetch(`/api/graph`, signal);
