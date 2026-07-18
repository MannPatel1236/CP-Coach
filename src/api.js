// All Codeforces API calls go through /cf-api which Vite proxies to
// https://codeforces.com/api — this bypasses CORS.

const BASE = import.meta.env.PROD ? "/api/cf" : "/cf-api";

const REQUEST_DELAY_MS = 800;
const MAX_HANDLE_LENGTH = 40;
const HANDLE_PATTERN = /^[a-zA-Z0-9_-]+$/;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function validateHandle(handle) {
  if (!handle || typeof handle !== "string") {
    throw new Error("Handle is required.");
  }
  if (handle.length > MAX_HANDLE_LENGTH) {
    throw new Error("Handle too long.");
  }
  if (!HANDLE_PATTERN.test(handle)) {
    throw new Error("Invalid characters in handle.");
  }
}

// ─── Tag normalization (mirrors backend/platforms/normalizer.py) ──────────────
// Canonical-namespace tags are the lingua franca the backend + topic graph use.
// Normalizing CF tags here keeps the client-only fallback path (Path B) in sync
// with the backend path (Path A), so topic-graph highlighting and next-topic
// dedup work the same regardless of whether the backend answered.

export const CF_TAG_MAP = {
  "dfs and similar": "dfs_and_similar",
  "constructive algorithms": "constructive_algorithms",
  "binary search": "binary_search",
  "two pointers": "two_pointers",
  "number theory": "number_theory",
  "data structures": "data_structures",
  "divide and conquer": "divide_and_conquer",
  "brute force": "brute_force",
  "dynamic programming": "dp",
  // ── Additions (match backend normalizer.py) ────────────────────────────
  "dsu": "dsu",
  "shortest paths": "shortest_paths",
  "string suffix structures": "string_algorithms",
  "matrices": "matrices",
  "graph matchings": "flows",
  "probabilities": "math",
  "games": "dp",
  "fft": "math",
  "ternary search": "binary_search",
  "meet in the middle": "divide_and_conquer",
  "expression parsing": "string_algorithms",
  "2-sat": "graphs",
  "chinese remainder theorem": "number_theory",
};

// Inverse: canonical → the single CF API tag to query. Hand-authored because
// CF_TAG_MAP is many-to-one (e.g. "dynamic programming" AND "games" both → "dp")
// — auto-inverting would sometimes map "dp" → "games", which the CF problemset
// API does not index. We always pick the mainstream CF tag. Tags not listed
// fall back to `_`→` ` which is correct for identity cases (canonical name is
// just the underscored CF tag, e.g. "math"→"math").
// LC-only topics (backtracking, dp_on_trees, prefix_sum, sliding_window) are
// intentionally absent — they have no CF API tag to query.
export const CANONICAL_TO_CF_TAG = {
  implementation: "implementation",
  math: "math",
  greedy: "greedy",
  constructive_algorithms: "constructive algorithms",
  binary_search: "binary search",
  two_pointers: "two pointers",
  sortings: "sortings",
  strings: "strings",
  number_theory: "number theory",
  combinatorics: "combinatorics",
  dfs_and_similar: "dfs and similar",
  graphs: "graphs",
  trees: "trees",
  dp: "dynamic programming",
  data_structures: "data structures",
  bitmasks: "bitmasks",
  divide_and_conquer: "divide and conquer",
  hashing: "hashing",
  geometry: "geometry",
  flows: "graph matchings",
  brute_force: "brute force",
  dsu: "dsu",
  shortest_paths: "shortest paths",
  string_algorithms: "string suffix structures",
  matrices: "matrices",
};

export function normalizeCfTag(tag) {
  return CF_TAG_MAP[tag] || tag.toLowerCase().replace(/ /g, "_");
}

export function canonicalToCfTag(tag) {
  return CANONICAL_TO_CF_TAG[tag] || tag.replace(/_/g, " ");
}

export async function fetchUserInfo(handle, signal) {
  validateHandle(handle);
  const res = await fetch(`${BASE}/user.info?handles=${encodeURIComponent(handle)}`, { signal });
  if (!res.ok) throw new Error(`Codeforces API error (${res.status}). Please try again.`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error(data.comment || "Handle not found.");
  return data.result[0];
}

export async function fetchSubmissions(handle, mode = "quick", signal) {
  validateHandle(handle);
  if (mode === "quick") {
    const res = await fetch(
      `${BASE}/user.status?handle=${encodeURIComponent(handle)}&count=1000`,
      { signal }
    );
    if (!res.ok) throw new Error(`Codeforces API error (${res.status}). Please try again.`);
    const data = await res.json();
    if (data.status !== "OK") throw new Error("Could not fetch submissions.");
    return data.result;
  }

  // Deep mode: paginate until end of history or 8,000 submissions
  const MAX = 8000;
  const PAGE = 1000;
  let all = [];
  let from = 1;

  while (all.length < MAX) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await fetch(
      `${BASE}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${PAGE}`,
      { signal }
    );
    if (!res.ok) throw new Error(`Codeforces API error (${res.status}). Please try again.`);
    const data = await res.json();
    if (data.status !== "OK") throw new Error("Could not fetch submissions.");
    const batch = data.result;
    all = all.concat(batch);
    if (batch.length < PAGE) break; // reached end of history
    from += PAGE;
    await sleep(REQUEST_DELAY_MS);
  }

  return all;
}

// Fetch problems for a single tag. `tag` may be a canonical name (e.g. "dp")
// or a raw CF tag (e.g. "dynamic programming"); canonicalToCfTag resolves both
// to the CF problemset API's expected tag string.
export async function fetchProblemsByTag(tag, signal) {
  const cfTag = canonicalToCfTag(tag);
  const res = await fetch(
    `${BASE}/problemset.problems?tags=${encodeURIComponent(cfTag)}`,
    { signal }
  );
  if (!res.ok) throw new Error(`Codeforces API error (${res.status}). Please try again.`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error("Could not fetch problems.");
  if (!data.result) return { problems: [], stats: [] };
  return {
    problems: data.result.problems,
    stats: data.result.problemStatistics,
  };
}

// Limit concurrent parallel tag fetches to avoid rate limits
const MAX_CONCURRENT = 3;

async function fetchAllTags(tags, signal) {
  if (tags.length <= MAX_CONCURRENT) {
    return Promise.all(tags.map((tag) => fetchProblemsByTag(tag, signal)));
  }
  const batches = [];
  for (let i = 0; i < tags.length; i += MAX_CONCURRENT) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = tags.slice(i, i + MAX_CONCURRENT);
    batches.push(await Promise.all(batch.map((tag) => fetchProblemsByTag(tag, signal))));
  }
  return batches.flat();
}

// Fetch problems for multiple tags in parallel, merge and deduplicate
export async function fetchProblemsForTags(tags, signal) {
  const results = await fetchAllTags(tags, signal);

  // Merge all problems, keeping track of which tags each problem covers
  const problemMap = {}; // key → { problem, tags[], solvedCount }

  results.forEach(({ problems, stats }, i) => {
    const tag = tags[i];

    const statMap = {};
    stats.forEach((s) => { statMap[`${s.contestId}-${s.index}`] = s.solvedCount; });

    problems.forEach((p) => {
      const key = `${p.contestId}-${p.index}`;
      if (!problemMap[key]) {
        problemMap[key] = {
          ...p,
          matchedTags: [],
          solvedCount: statMap[key] || 0,
        };
      }
      problemMap[key].matchedTags.push(tag);
      // Keep the higher solvedCount if seen from multiple tag fetches
      if (statMap[key] > problemMap[key].solvedCount) {
        problemMap[key].solvedCount = statMap[key];
      }
    });
  });

  return Object.values(problemMap);
}

// ─── Data Processing ──────────────────────────────────────────────────────────

export function buildTagProfile(submissions) {
  const tagMap = {};
  const solvedSet = new Set();
  const total = submissions.length;

  // Submissions arrive newest-first from the CF API.
  // Assign a recency weight: most recent = 1.0, oldest approaches 0.2.
  // This means recent performance dominates the skill score,
  // so old failures don't permanently penalise a mastered topic.
  submissions.forEach((sub, idx) => {
    if (!sub.problem?.tags?.length) return;
    const key = `${sub.problem.contestId}-${sub.problem.index}`;
    const weight = 1.0 - (0.8 * idx) / Math.max(total - 1, 1); // 1.0 → 0.2

    if (sub.verdict === "OK") solvedSet.add(key);

    sub.problem.tags.forEach((rawTag) => {
      const tag = normalizeCfTag(rawTag);
      if (!tagMap[tag]) {
        tagMap[tag] = {
          attempted: new Set(),
          solved: new Set(),
          weightedAttempts: 0,
          weightedSolved: 0,
          ratings: [],
        };
      }
      // Only count the first attempt per unique problem per tag
      // to avoid inflate from repeated submissions of same problem.
      if (!tagMap[tag].attempted.has(key)) {
        tagMap[tag].weightedAttempts += weight;
        if (sub.verdict === "OK") tagMap[tag].weightedSolved += weight;
      }
      tagMap[tag].attempted.add(key);
      if (sub.verdict === "OK") {
        const firstSolveInTag = !tagMap[tag].solved.has(key);
        tagMap[tag].solved.add(key);
        if (sub.problem.rating && firstSolveInTag) {
          tagMap[tag].ratings.push(sub.problem.rating);
        }
      }
    });
  });

  const profile = Object.entries(tagMap)
    .filter(([, v]) => v.attempted.size >= 1)
    .map(([tag, v]) => {
      const avgRating = v.ratings.length
        ? Math.round(v.ratings.reduce((a, b) => a + b, 0) / v.ratings.length)
        : null;
      const weightedAcRate = v.weightedAttempts > 0
        ? Math.round((v.weightedSolved / v.weightedAttempts) * 100)
        : 0;
      return {
        tag,
        attempts: v.attempted.size,
        solved: v.solved.size,
        acRate: weightedAcRate,   // weighted, recency-aware
        rawAcRate: Math.round((v.solved.size / v.attempted.size) * 100),
        avgRating,
      };
    })
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 16);

  return { profile, solvedSet };
}

export function findWeakTags(profile, threshold = 65) {
  // Standard weak: below the AC rate threshold
  const weak = profile.filter((t) => t.acRate < threshold);

  // Beginner weak: even if AC rate is high, flag tags with very few
  // solved problems — the user needs more practice volume.
  if (weak.length === 0) {
    const needsPractice = profile.filter(
      (t) => t.acRate >= threshold && t.solved < 10
    );
    if (needsPractice.length > 0) {
      return needsPractice
        .sort((a, b) => a.solved - b.solved)
        .slice(0, 3)
        .map((t) => ({ ...t, lowVolume: true }));
    }
  }

  return weak
    .sort((a, b) => a.acRate - b.acRate)
    .slice(0, 3);
}

// Build recommendations from an already-merged problem list (multi-tag)
const MAX_RECOMMENDATIONS = 12;
const BASE_RECOMMEND_RATING = 800;
const RATING_STEP = 100;
const NORMAL_RATING_RANGE = 350;
const STRETCH_RATING_RANGE = 600;

function toRecommendation(p, isStretch) {
  return {
    name: p.name,
    rating: p.rating,
    contestId: p.contestId,
    index: p.index,
    solvedCount: p.solvedCount || 0,
    matchedTags: p.matchedTags || [],
    url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    isStretch,
  };
}

export function buildRecommendations(problems, solvedSet, userRating) {
  const lo = Math.max(BASE_RECOMMEND_RATING, Math.floor((userRating - 100) / RATING_STEP) * RATING_STEP);
  const hi = Math.ceil((userRating + NORMAL_RATING_RANGE) / RATING_STEP) * RATING_STEP;

  const base = problems
    .filter((p) => {
      const key = `${p.contestId}-${p.index}`;
      const ratingOk = !p.rating || (p.rating >= lo && p.rating <= hi);
      return ratingOk && !solvedSet.has(key) && p.name && p.contestId;
    })
    .map((p) => toRecommendation(p, false))
    .sort((a, b) => {
      if (b.matchedTags.length !== a.matchedTags.length)
        return b.matchedTags.length - a.matchedTags.length;
      return b.solvedCount - a.solvedCount;
    })
    .slice(0, MAX_RECOMMENDATIONS);

  if (base.length > 0) return base;

  // Pool exhausted — widen to +600 above rating and flag as stretch
  const hiStretch = Math.ceil((userRating + STRETCH_RATING_RANGE) / RATING_STEP) * RATING_STEP;
  return problems
    .filter((p) => {
      const key = `${p.contestId}-${p.index}`;
      const ratingOk = !p.rating || (p.rating >= lo && p.rating <= hiStretch);
      return ratingOk && !solvedSet.has(key) && p.name && p.contestId;
    })
    .map((p) => toRecommendation(p, true))
    .sort((a, b) => (a.rating || 9999) - (b.rating || 9999))
    .slice(0, MAX_RECOMMENDATIONS);
}

// ─── Next Topic Suggestions ───────────────────────────────────────────────────
// All `tag` values are CANONICAL names so dedup against buildTagProfile output
// (also canonical) works, and so suggestions line up with topic-graph node IDs.
const TOPIC_LADDER = [
  { tag: "implementation",          minRating: 0,    maxRating: 1600 },
  { tag: "brute_force",             minRating: 0,    maxRating: 1500 },
  { tag: "math",                    minRating: 0,    maxRating: 2000 },
  { tag: "greedy",                  minRating: 800,  maxRating: 2200 },
  { tag: "sortings",                minRating: 800,  maxRating: 1800 },
  { tag: "binary_search",           minRating: 1000, maxRating: 2200 },
  { tag: "two_pointers",            minRating: 1000, maxRating: 2000 },
  { tag: "strings",                 minRating: 1000, maxRating: 2200 },
  { tag: "constructive_algorithms", minRating: 1100, maxRating: 2400 },
  { tag: "number_theory",           minRating: 1200, maxRating: 2400 },
  { tag: "dfs_and_similar",         minRating: 1200, maxRating: 2400 },
  { tag: "graphs",                  minRating: 1300, maxRating: 2600 },
  { tag: "trees",                   minRating: 1300, maxRating: 2600 },
  { tag: "dp",                       minRating: 1400, maxRating: 3500 },
  { tag: "data_structures",         minRating: 1400, maxRating: 3500 },
  { tag: "bitmasks",                minRating: 1500, maxRating: 2600 },
  { tag: "divide_and_conquer",      minRating: 1600, maxRating: 3000 },
  { tag: "combinatorics",           minRating: 1600, maxRating: 3000 },
  { tag: "hashing",                 minRating: 1600, maxRating: 2800 },
  { tag: "geometry",                minRating: 1800, maxRating: 3500 },
  { tag: "flows",                   minRating: 2000, maxRating: 3500 },
];

// Returns up to `count` untouched topics appropriate for the user's rating
export function findNextTopics(profile, userRating, count = 5) {
  // Only consider a tag "well-attempted" if the user solved >= 10 problems in it
  const wellAttempted = new Set(
    profile.filter((t) => t.solved >= 10).map((t) => t.tag)
  );

  return TOPIC_LADDER
    .filter(
      (t) =>
        !wellAttempted.has(t.tag) &&
        userRating >= t.minRating &&
        userRating <= t.maxRating + 400
    )
    .slice(0, count)
    .map((t) => t.tag);
}
