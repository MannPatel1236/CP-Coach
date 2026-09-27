// Regression for smoke bug #7: recommendations stayed hidden after a fresh
// analysis because the seed effect's deps were all stable refs — it ran once at
// mount, found empty refs, and never re-ran when analyze() filled them. `user`
// is now a dep; this pins the seed-on-first-analysis behavior.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useRecommendations from "./useRecommendations.js";

vi.mock("../api.js", () => ({
  fetchProblemsForTags: vi.fn(),
  buildRecommendations: vi.fn(),
}));
vi.mock("../api/backendClient.js", () => ({
  getRecommendations: vi.fn(),
  getRecommendationsWithMastery: vi.fn(),
}));

const RECS = [{ problem_id: "cf-1023A" }, { problem_id: "cf-1023B" }];

function makeProps(user, refs = {
  analysisRecommendationsRef: { current: [] },
  analysisSelectedTopicsRef: { current: [] },
  analysisActiveWeakTagRef: { current: null },
}) {
  return {
    solvedSet: new Set(),
    user,
    abortRef: { current: null },
    resetAbort: () => {},
    ...refs,
    analysisMasteryScoresRef: { current: {} },
    platform: "cf",
    combinedPlatform: false,
    cfHandle: "",
    lcHandle: "",
  };
}

describe("useRecommendations auto-seed from analyze()", () => {
  it("seeds recs when the first analysis completes (user identity change retriggers the effect)", () => {
    // Production mechanics: the hook mounts with EMPTY refs (no snapshot), then
    // analyze() mutates the same ref objects in place and flips user identity.
    const refs = {
      analysisRecommendationsRef: { current: [] },
      analysisSelectedTopicsRef: { current: [] },
      analysisActiveWeakTagRef: { current: null },
    };
    const { result, rerender } = renderHook((p) => useRecommendations(p), {
      initialProps: makeProps(null, refs),
    });
    expect(result.current.recs).toEqual([]);

    refs.analysisRecommendationsRef.current = RECS;
    refs.analysisSelectedTopicsRef.current = ["dp"];
    refs.analysisActiveWeakTagRef.current = "dp";
    rerender(makeProps({ handle: "mannpatel", platform: "cf" }, refs));

    expect(result.current.recs).toEqual(RECS);
    expect(result.current.selectedTopics).toEqual(["dp"]);
    expect(result.current.activeWeakTag).toBe("dp");
  });

  it("does not seed when analyze produced no recommendations (weak=0 picker path)", () => {
    const { result } = renderHook((p) => useRecommendations(p), {
      initialProps: makeProps({ handle: "mannpatel", platform: "cf" }),
    });

    expect(result.current.recs).toEqual([]);
    expect(result.current.selectedTopics).toEqual([]);
  });
});

describe("useRecommendations clearFocus", () => {
  it("restores the initial recommendation set and selected topics from analyze()", () => {
    const refs = {
      analysisRecommendationsRef: { current: RECS },
      analysisSelectedTopicsRef: { current: ["dp"] },
      analysisActiveWeakTagRef: { current: "dp" },
    };
    const { result } = renderHook((p) => useRecommendations(p), {
      initialProps: makeProps({ handle: "mannpatel", platform: "cf" }, refs),
    });

    // Simulate a user-driven focus change away from the seeded state.
    act(() => {
      result.current.setSelectedTopics(["graphs"]);
      result.current.setActiveWeakTag("graphs");
      result.current.setRecs([]);
    });

    act(() => {
      result.current.clearFocus();
    });

    expect(result.current.recs).toEqual(RECS);
    expect(result.current.selectedTopics).toEqual(["dp"]);
    expect(result.current.activeWeakTag).toBe("dp");
  });
});
