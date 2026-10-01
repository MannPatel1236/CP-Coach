// Shared smoke fixture for Greenhouse Phase 2 dashboard render tests (spec §10).
// One canned analyze payload that SkillFrontier / WhyThisRec / Recommendations
// tests share. Override any field via renderInContext(ui, { modelUsed: "rule_based" }).
import { createElement } from "react";
import { render } from "@testing-library/react";
import { AnalysisContext } from "../hooks/AnalysisContext.jsx";

export const baseContext = {
  handle: "mannpatel",
  setHandle: () => {},
  cfHandle: "mannpatel",
  setCfHandle: () => {},
  lcHandle: "",
  setLcHandle: () => {},
  // Primary-identity resolver (App.jsx computes these; fixture mirrors the
  // handles-first precedence so panel tests exercise realistic values).
  primaryHandle: "mannpatel",
  primaryPlatform: "cf",
  loading: false,
  loadingStep: 0,
  error: "",
  // §8 provenance signal — default "graph_dkt"; badge tests override to "rule_based".
  modelUsed: "graph_dkt",
  // masteryScoresRef is a stable ref {current: {...}} — fixture freezes a 29-topic map.
  masteryScoresRef: {
    current: {
      implementation: 0.98, math: 0.92, greedy: 0.79, constructive_algorithms: 0.81,
      binary_search: 0.20, two_pointers: 0.90, sortings: 0.93, strings: 0.88,
      number_theory: 0.77, combinatorics: 0.62, dfs_and_similar: 0.74, graphs: 0.80,
      trees: 0.71, dp: 0.58, dp_on_trees: 0.40, data_structures: 0.83, bitmasks: 0.24,
      divide_and_conquer: 0.70, hashing: 0.66, geometry: 0.25, flows: 0.55, brute_force: 0.95,
      prefix_sum: 0.94, sliding_window: 0.86, dsu: 0.60, shortest_paths: 0.72,
      backtracking: 0.45, string_algorithms: 0.50, matrices: 0.63,
    },
  },
  // Weekly fused-mastery series (cf.dp only) for the SkillFrontier weekly chart.
  masteryWeekly: {
    cf: {
      dp: [
        null, null, null, null, null, null, null, null, null, null,
        { week: "2026-W39", p: 0.4 },
        { week: "2026-W40", p: 0.5 },
      ],
    },
    lc: null,
  },
  // §9 sibling-summary seed: the example trio from the spec ("binary_search 0.48,
  // bitmasks 0.52, geometry 0.55" — AC-rate %; mastery is the reciprocal-flavored 0.x).
  weakTags: [
    { tag: "binary_search", acRate: 48, solved: 5, attempts: 12 },
    { tag: "bitmasks", acRate: 52, solved: 3, attempts: 8 },
    { tag: "geometry", acRate: 55, solved: 4, attempts: 7 },
  ],
  activeWeakTag: "binary_search",
  selectWeakTag: () => {},
  user: { handle: "mannpatel", platform: "cf", rating: 1500, rank: "specialist" },
  cfUser: { handle: "mannpatel", platform: "cf", rating: 1500, rank: "specialist" },
  lcUser: null,
  tagProfile: [],
  solvedSet: new Set(),
  suggestedTopics: [],
  analysisMode: "quick", setAnalysisMode: () => {},
  platform: "cf", setPlatform: () => {},
  combinedPlatform: false, setCombinedPlatform: () => {},
  analyze: () => {}, clearAll: () => {},
  selectedTopics: ["binary_search"],
  fetchingRecs: false,
  // Two backend-format recs (one in-band, one stretch-adjacent) for WhyThisRec + Recommendations.
  recommendations: [
    {
      problem_id: "cf-1234A", platform: "cf", name: "Binary Search Walk", difficulty: 1500,
      solve_count: 1200, matched_topics: ["binary_search"], is_stretch: false,
      url: "https://codeforces.com/problemset/problem/1234/A",
    },
    {
      problem_id: "cf-1234B", platform: "cf", name: "Bitmask Count", difficulty: 1700,
      solve_count: 900, matched_topics: ["bitmasks"], is_stretch: false,
      url: "https://codeforces.com/problemset/problem/1234/B",
    },
  ],
  clearFocus: () => {}, toggleTopic: () => {}, fetchForSelectedTopics: () => {}, recError: "",
};

export function renderInContext(ui, overrides = {}) {
  const value = { ...baseContext, ...overrides };
  // Derive the primary-identity resolver from the FINAL merged context so
  // handle overrides ({ cfHandle: "", lcHandle: "lcuser" }) flow through,
  // mirroring App.jsx's handles-first precedence. Tests may still pin an
  // explicit primaryHandle/primaryPlatform via overrides.
  if (overrides.primaryHandle === undefined) {
    value.primaryHandle = value.cfHandle || value.lcHandle || (value.user && value.user.handle) || "";
    value.primaryPlatform = value.cfHandle ? "cf" : "lc";
  }
  return render(createElement(AnalysisContext.Provider, { value }, ui));
}
