// All Codeforces API calls go through /cf-api which Vite proxies to
// https://codeforces.com/api — this bypasses CORS.

const BASE = import.meta.env.PROD ? "/api/cf" : "/cf-api";

export async function fetchUserInfo(handle) {
  const res = await fetch(`${BASE}/user.info?handles=${encodeURIComponent(handle)}`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error(data.comment || "Handle not found.");
  return data.result[0];
}

export async function fetchSubmissions(handle, mode = "quick") {
  if (mode === "quick") {
    const res = await fetch(
      `${BASE}/user.status?handle=${encodeURIComponent(handle)}&count=1000`
    );
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
    const res = await fetch(
      `${BASE}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${PAGE}`
    );
    const data = await res.json();
    if (data.status !== "OK") throw new Error("Could not fetch submissions.");
    const batch = data.result;
    all = all.concat(batch);
    if (batch.length < PAGE) break; // reached end of history
    from += PAGE;
  }

  return all;
}

// Fetch problems for a single tag
export async function fetchProblemsByTag(tag) {
  const res = await fetch(
    `${BASE}/problemset.problems?tags=${encodeURIComponent(tag)}`
  );
  const data = await res.json();
  if (data.status !== "OK") throw new Error("Could not fetch problems.");
  return {
    problems: data.result.problems,
    stats: data.result.problemStatistics,
  };
}

// Fetch problems for multiple tags in parallel, merge and deduplicate
export async function fetchProblemsForTags(tags) {
  const results = await Promise.all(tags.map((tag) => fetchProblemsByTag(tag)));

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

    sub.problem.tags.forEach((tag) => {
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
        tagMap[tag].solved.add(key);
        if (sub.problem.rating) tagMap[tag].ratings.push(sub.problem.rating);
      }
    });
  });

  const profile = Object.entries(tagMap)
    .filter(([, v]) => v.attempted.size >= 3)
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
  return profile
    .filter((t) => t.acRate < threshold)
    .sort((a, b) => a.acRate - b.acRate)
    .slice(0, 3);
}

// Build recommendations from an already-merged problem list (multi-tag)
export function buildRecommendations(problems, solvedSet, userRating) {
  const lo = Math.max(800, Math.floor((userRating - 100) / 100) * 100);
  const hi = Math.ceil((userRating + 350) / 100) * 100;

  const base = problems
    .filter((p) => {
      const key = `${p.contestId}-${p.index}`;
      const ratingOk = !p.rating || (p.rating >= lo && p.rating <= hi);
      return ratingOk && !solvedSet.has(key) && p.name && p.contestId;
    })
    .map((p) => ({
      name: p.name,
      rating: p.rating,
      contestId: p.contestId,
      index: p.index,
      solvedCount: p.solvedCount || 0,
      matchedTags: p.matchedTags || [],
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
      isStretch: false,
    }))
    .sort((a, b) => {
      if (b.matchedTags.length !== a.matchedTags.length)
        return b.matchedTags.length - a.matchedTags.length;
      return b.solvedCount - a.solvedCount;
    })
    .slice(0, 12);

  if (base.length > 0) return base;

  // Pool exhausted — widen to +600 above rating and flag as stretch
  const hiStretch = Math.ceil((userRating + 600) / 100) * 100;
  return problems
    .filter((p) => {
      const key = `${p.contestId}-${p.index}`;
      const ratingOk = !p.rating || (p.rating >= lo && p.rating <= hiStretch);
      return ratingOk && !solvedSet.has(key) && p.name && p.contestId;
    })
    .map((p) => ({
      name: p.name,
      rating: p.rating,
      contestId: p.contestId,
      index: p.index,
      solvedCount: p.solvedCount || 0,
      matchedTags: p.matchedTags || [],
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
      isStretch: true,
    }))
    .sort((a, b) => (a.rating || 9999) - (b.rating || 9999))
    .slice(0, 12);
}

// ─── Next Topic Suggestions ───────────────────────────────────────────────────
const TOPIC_LADDER = [
  { tag: "implementation",          minRating: 0,    maxRating: 1600 },
  { tag: "brute force",             minRating: 0,    maxRating: 1500 },
  { tag: "math",                    minRating: 0,    maxRating: 2000 },
  { tag: "greedy",                  minRating: 800,  maxRating: 2200 },
  { tag: "sortings",                minRating: 800,  maxRating: 1800 },
  { tag: "binary search",           minRating: 1000, maxRating: 2200 },
  { tag: "two pointers",            minRating: 1000, maxRating: 2000 },
  { tag: "strings",                 minRating: 1000, maxRating: 2200 },
  { tag: "constructive algorithms", minRating: 1100, maxRating: 2400 },
  { tag: "number theory",           minRating: 1200, maxRating: 2400 },
  { tag: "dfs and similar",         minRating: 1200, maxRating: 2400 },
  { tag: "graphs",                  minRating: 1300, maxRating: 2600 },
  { tag: "trees",                   minRating: 1300, maxRating: 2600 },
  { tag: "dp",                       minRating: 1400, maxRating: 3500 },
  { tag: "data structures",         minRating: 1400, maxRating: 3500 },
  { tag: "bitmasks",                minRating: 1500, maxRating: 2600 },
  { tag: "divide and conquer",      minRating: 1600, maxRating: 3000 },
  { tag: "combinatorics",           minRating: 1600, maxRating: 3000 },
  { tag: "hashing",                 minRating: 1600, maxRating: 2800 },
  { tag: "geometry",                minRating: 1800, maxRating: 3500 },
  { tag: "flows",                   minRating: 2000, maxRating: 3500 },
];

// Returns up to `count` untouched topics appropriate for the user's rating
export function findNextTopics(profile, userRating, count = 5) {
  const attemptedTags = new Set(profile.map((t) => t.tag));

  return TOPIC_LADDER
    .filter(
      (t) =>
        !attemptedTags.has(t.tag) &&
        userRating >= t.minRating &&
        userRating <= t.maxRating + 400
    )
    .slice(0, count)
    .map((t) => t.tag);
}
