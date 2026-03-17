// All Codeforces API calls go through /cf-api which Vite proxies to
// https://codeforces.com/api — this bypasses CORS.

const BASE = "/cf-api";

export async function fetchUserInfo(handle) {
  const res = await fetch(`${BASE}/user.info?handles=${encodeURIComponent(handle)}`);
  const data = await res.json();
  if (data.status !== "OK") throw new Error(data.comment || "Handle not found.");
  return data.result[0];
}

export async function fetchSubmissions(handle, count = 1000) {
  const res = await fetch(
    `${BASE}/user.status?handle=${encodeURIComponent(handle)}&count=${count}`
  );
  const data = await res.json();
  if (data.status !== "OK") throw new Error("Could not fetch submissions.");
  return data.result;
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

  submissions.forEach((sub) => {
    if (!sub.problem?.tags?.length) return;
    const key = `${sub.problem.contestId}-${sub.problem.index}`;

    if (sub.verdict === "OK") solvedSet.add(key);

    sub.problem.tags.forEach((tag) => {
      if (!tagMap[tag]) {
        tagMap[tag] = { attempted: new Set(), solved: new Set(), ratings: [] };
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
      return {
        tag,
        attempts: v.attempted.size,
        solved: v.solved.size,
        acRate: Math.round((v.solved.size / v.attempted.size) * 100),
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
  const lo = Math.max(800, userRating - 100);
  const hi = userRating + 350;

  return problems
    .filter((p) => {
      const key = `${p.contestId}-${p.index}`;
      return (
        p.rating >= lo &&
        p.rating <= hi &&
        !solvedSet.has(key) &&
        p.name &&
        p.contestId
      );
    })
    .map((p) => ({
      name: p.name,
      rating: p.rating,
      contestId: p.contestId,
      index: p.index,
      solvedCount: p.solvedCount || 0,
      matchedTags: p.matchedTags || [],
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    }))
    .sort((a, b) => {
      // Problems matching more selected tags rank higher, then by solve count
      if (b.matchedTags.length !== a.matchedTags.length)
        return b.matchedTags.length - a.matchedTags.length;
      return b.solvedCount - a.solvedCount;
    })
    .slice(0, 12);
}

// ─── Next Topic Suggestions ───────────────────────────────────────────────────
const TOPIC_LADDER = [
  { tag: "implementation",          minRating: 0,    maxRating: 1600 },
  { tag: "brute force",             minRating: 0,    maxRating: 1500 },
  { tag: "math",                    minRating: 0,    maxRating: 2000 },
  { tag: "greedy",                  minRating: 800,  maxRating: 2200 },
  { tag: "sorting",                 minRating: 800,  maxRating: 1800 },
  { tag: "binary search",           minRating: 1000, maxRating: 2200 },
  { tag: "two pointers",            minRating: 1000, maxRating: 2000 },
  { tag: "strings",                 minRating: 1000, maxRating: 2200 },
  { tag: "constructive algorithms", minRating: 1100, maxRating: 2400 },
  { tag: "number theory",           minRating: 1200, maxRating: 2400 },
  { tag: "dfs and similar",         minRating: 1200, maxRating: 2400 },
  { tag: "graphs",                  minRating: 1300, maxRating: 2600 },
  { tag: "trees",                   minRating: 1300, maxRating: 2600 },
  { tag: "dynamic programming",     minRating: 1400, maxRating: 3500 },
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
