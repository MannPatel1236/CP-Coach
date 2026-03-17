// ─── AC Rate colors ───────────────────────────────────────────────────────────
export const acColor = (rate) => {
  if (rate < 40) return "#ef4444"; // red
  if (rate < 65) return "#f59e0b"; // amber
  return "#22c55e";                 // green
};

// ─── Codeforces rank colors (Official) ─────────────────────────────────────────
export const rankColor = (rank = "") => {
  const r = rank.toLowerCase();
  if (r.includes("legendary grandmaster")) return "#ff0000";
  if (r.includes("international grandmaster")) return "#ff0000";
  if (r.includes("grandmaster")) return "#ff0000";
  if (r.includes("international master")) return "#ff8c00";
  if (r.includes("master")) return "#ff8c00";
  if (r.includes("candidate master")) return "#aa00aa";
  if (r.includes("expert")) return "#0000ff";
  if (r.includes("specialist")) return "#03a89e";
  if (r.includes("pupil")) return "#008000";
  return "#808080"; // newbie / unrated
};

// ─── Shorten long tag names for chart axes ────────────────────────────────────
const SHORT = {
  "dynamic programming": "DP",
  "data structures": "DS",
  "constructive algorithms": "constr.",
  "dfs and similar": "DFS",
  "implementation": "impl",
  "binary search": "bin.srch",
  "number theory": "num.th.",
  "two pointers": "2-ptr",
  "divide and conquer": "D&C",
  "brute force": "brute",
  "geometry": "geom",
  "bitmasks": "bitmask",
  "combinatorics": "combo",
};

export const shortenTag = (tag) => SHORT[tag] || (tag.length > 10 ? tag.slice(0, 9) + "." : tag);

// ─── Problem difficulty badge colors (Official) ──────────────────────────────
export const diffColor = (rating) => {
  if (!rating) return { bg: "rgba(128, 128, 128, 0.1)", border: "rgba(128, 128, 128, 0.2)", text: "#808080" };
  if (rating >= 2400) return { bg: "rgba(255, 0, 0, 0.1)", border: "rgba(255, 0, 0, 0.25)", text: "#ff0000" };
  if (rating >= 2200) return { bg: "rgba(255, 140, 0, 0.1)", border: "rgba(255, 140, 0, 0.25)", text: "#ff8c00" };
  if (rating >= 1900) return { bg: "rgba(170, 0, 170, 0.1)", border: "rgba(170, 0, 170, 0.25)", text: "#aa00aa" };
  if (rating >= 1600) return { bg: "rgba(0, 0, 255, 0.1)", border: "rgba(0, 0, 255, 0.25)", text: "#0000ff" };
  if (rating >= 1400) return { bg: "rgba(3, 168, 158, 0.1)", border: "rgba(3, 168, 158, 0.25)", text: "#03a89e" };
  if (rating >= 1200) return { bg: "rgba(0, 128, 0, 0.1)", border: "rgba(0, 128, 0, 0.25)", text: "#008000" };
  return { bg: "rgba(128, 128, 128, 0.08)", border: "rgba(128, 128, 128, 0.2)", text: "#808080" };
};

export const ratingColor = (rating) => {
  if (!rating) return "#808080";
  if (rating >= 3000) return "#ff0000";
  if (rating >= 2400) return "#ff0000";
  if (rating >= 2200) return "#ff8c00";
  if (rating >= 1900) return "#aa00aa";
  if (rating >= 1600) return "#0000ff";
  if (rating >= 1400) return "#03a89e";
  if (rating >= 1200) return "#008000";
  return "#808080";
};
