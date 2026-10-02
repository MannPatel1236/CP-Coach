// Behavioral coverage for the snapshot machinery (gate finding: the string-style
// suite only pinned source substrings, never persistence behavior).
//
// useAnalysis memoizes the parsed snapshot in a module-level `cachedSnapshot`, so
// every test re-imports the module via vi.resetModules() to start from a clean
// cache instead of depending on file-level test order.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../api.js", () => ({
  fetchUserInfo: vi.fn(),
  fetchSubmissions: vi.fn(),
  fetchProblemsForTags: vi.fn(),
  buildTagProfile: vi.fn(),
  findWeakTags: vi.fn(),
  buildRecommendations: vi.fn(),
  findNextTopics: vi.fn(() => []),
}));

vi.mock("../api/backendClient.js", () => ({
  analyzeHandle: vi.fn(),
  getRecommendations: vi.fn(),
  getRecommendationsWithMastery: vi.fn(),
}));

const SNAPSHOT_KEY = "cpcoach.analysis";
const BACKEND_ANALYSIS = {
  handle: "mannpatel", platform: "cf", rating: 1500, rank: "specialist",
  maxRating: 1600, maxRank: "expert", avatar: null, country: null, organization: null,
  topic_profile: [{
    topic: "dp", attempts: 10, solved: 3, solve_rate: 0.3,
    solved_problems: ["cf-1A", "cf-1B"],
  }],
  weak_areas: ["dp"], mastery_scores: { dp: 0.4 }, model_used: "graph_dkt",
  mastery_weekly: { dp: [{ week: "2026-W40", p: 0.4 }] },
};

const loadHook = async () => {
  vi.resetModules();
  const mod = await import("./useAnalysis.js");
  return mod.default;
};

const analyzeMannpatel = async (result) => {
  const { analyzeHandle, getRecommendationsWithMastery } = await import("../api/backendClient.js");
  analyzeHandle.mockResolvedValue(BACKEND_ANALYSIS);
  getRecommendationsWithMastery.mockResolvedValue({ recommendations: [{ problem_id: "cf-1023A" }] });
  act(() => { result.current.setHandle("mannpatel"); });
  await act(async () => { await result.current.analyze(); });
};

const stored = () => JSON.parse(window.localStorage.getItem(SNAPSHOT_KEY));

beforeEach(() => {
  window.localStorage.clear();
});

describe("useAnalysis snapshot persistence — behavioral", () => {
  it("persists the resolved analysis and populates cfUser/cfHandle on the CF-only path", async () => {
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());

    await analyzeMannpatel(result);

    expect(result.current.user?.handle).toBe("mannpatel");
    // cf-only regression (#5): analytics sections key off cfUser/cfHandle, which
    // used to stay null outside combined mode → RatingTrajectory never mounted.
    expect(result.current.cfUser?.handle).toBe("mannpatel");
    expect(result.current.cfHandle).toBe("mannpatel");

    const snap = stored();
    expect(snap.user.handle).toBe("mannpatel");
    expect(snap.cfUser.handle).toBe("mannpatel");
    expect(snap.modelUsed).toBe("graph_dkt");
    expect(snap.masteryScores).toEqual({ dp: 0.4 });
    expect(snap.masteryWeekly).toEqual({ cf: { dp: [{ week: "2026-W40", p: 0.4 }] }, lc: null });
    expect(snap.analysisRecommendations).toEqual([{ problem_id: "cf-1023A" }]);
    expect(snap.solvedSet).toEqual(["cf-1A", "cf-1B"]);
  });

  it("restores a stored snapshot on mount (refresh lands on the dashboard)", async () => {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      handle: "mannpatel", cfHandle: "mannpatel", lcHandle: "",
      user: { handle: "mannpatel", platform: "cf" }, cfUser: { handle: "mannpatel", platform: "cf" },
      lcUser: null, tagProfile: [], weakTags: [], solvedSet: [], suggestedTopics: [],
      analysisMode: "quick", platform: "cf", combinedPlatform: false, modelUsed: "graph_dkt",
      masteryScores: {}, analysisRecommendations: [], analysisSelectedTopics: [],
      analysisActiveWeakTag: null,
    }));
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());

    expect(result.current.user?.handle).toBe("mannpatel");
    expect(result.current.modelUsed).toBe("graph_dkt");
    expect(result.current.cfHandle).toBe("mannpatel");
  });

  it("corrupt JSON starts empty (never throws, never restores half a snapshot)", async () => {
    window.localStorage.setItem(SNAPSHOT_KEY, "{oops");
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());

    expect(result.current.user).toBeNull();
  });

  it("rejects a snapshot with a future schema version instead of half-restoring it", async () => {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      v: 999, handle: "mannpatel", cfHandle: "mannpatel", lcHandle: "",
      user: { handle: "mannpatel", platform: "cf" }, cfUser: { handle: "mannpatel" },
      lcUser: null, tagProfile: [], weakTags: [], solvedSet: [], suggestedTopics: [],
      analysisMode: "quick", platform: "cf", combinedPlatform: false, modelUsed: null,
      masteryScores: {}, analysisRecommendations: [], analysisSelectedTopics: [],
      analysisActiveWeakTag: null,
    }));
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());

    expect(result.current.user).toBeNull();
  });

  it("rejects a snapshot older than the 30-day staleness bound", async () => {
    const stale = Date.now() - 31 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      v: 1, savedAt: stale, handle: "mannpatel", cfHandle: "mannpatel", lcHandle: "",
      user: { handle: "mannpatel", platform: "cf" }, cfUser: { handle: "mannpatel" },
      lcUser: null, tagProfile: [], weakTags: [], solvedSet: [], suggestedTopics: [],
      analysisMode: "quick", platform: "cf", combinedPlatform: false, modelUsed: null,
      masteryScores: {}, analysisRecommendations: [], analysisSelectedTopics: [],
      analysisActiveWeakTag: null,
    }));
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());

    // Months-old data must fall back to the landing page, not pose as current.
    expect(result.current.user).toBeNull();
  });

  it("clearAll removes the key and resets state to the landing page", async () => {
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());
    await analyzeMannpatel(result);
    expect(stored()).toBeTruthy();

    act(() => { result.current.clearAll(); });

    expect(result.current.user).toBeNull();
    expect(result.current.handle).toBe("");
    expect(window.localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
    expect(result.current.masteryWeekly).toBeNull();
  });

  it("identity guard: typing a new query over a displayed analysis does not rewrite the snapshot", async () => {
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());
    await analyzeMannpatel(result);
    const before = stored();

    act(() => { result.current.setHandle("tourist"); });

    // The persist effect re-ran (handle is a dep) but skipped the write — the
    // snapshot still pairs mannpatel's profile with mannpatel's name.
    expect(stored()).toEqual(before);
    expect(stored().handle).toBe("mannpatel");
  });

  it("a failed re-analysis invalidates the stored snapshot up front", async () => {
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());
    await analyzeMannpatel(result);
    expect(stored()).toBeTruthy();

    const { analyzeHandle } = await import("../api/backendClient.js");
    analyzeHandle.mockRejectedValue(new Error("CF API down"));
    // Backend failure falls through to the client path — its first call must
    // carry the failure too, otherwise the flow dies on an undefined profile.
    const { fetchUserInfo } = await import("../api.js");
    fetchUserInfo.mockRejectedValue(new Error("CF API down"));
    act(() => { result.current.setHandle("tourist"); });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.error).toContain("CF API down");
    expect(window.localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
  });

  it("LC analysis clears cfHandle/cfUser (handle symmetry, fix-batch-2)", async () => {
    const { analyzeHandle, getRecommendationsWithMastery } = await import("../api/backendClient.js");
    const lcPayload = { ...BACKEND_ANALYSIS, handle: "lcuser", platform: "lc" };
    const recs = Promise.resolve({ recommendations: [] });
    getRecommendationsWithMastery.mockImplementation(() => recs);
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());
    await analyzeMannpatel(result); // CF side first: populates cfHandle/cfUser
    // analyzeMannpatel installed a flat mockResolvedValue — restore the
    // platform-aware implementation for the LC pass under test.
    analyzeHandle.mockImplementation((_h, platform) =>
      Promise.resolve(platform === "lc" ? lcPayload : BACKEND_ANALYSIS));

    act(() => { result.current.setPlatform("lc"); });
    act(() => { result.current.setHandle("lcuser"); });
    await act(async () => { await result.current.analyze(); });

    expect(result.current.lcUser?.handle).toBe("lcuser");
    expect(result.current.lcHandle).toBe("lcuser");
    // The regression this pins: retaining cfHandle after an LC analysis made
    // Phase-4 sections fetch the STALE prior CF handle at cf endpoints.
    expect(result.current.cfHandle).toBe("");
    expect(result.current.cfUser).toBeNull();

    const snap = stored();
    expect(snap.cfHandle).toBe("");
    expect(snap.cfUser).toBeNull();
    expect(snap.lcHandle).toBe("lcuser");
  });

  it("platform-input guard: editing combined-mode handles without re-analyzing does not rewrite the snapshot", async () => {
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());
    await analyzeMannpatel(result);
    const before = stored();

    // 'mannpatel' is still in analyzedIds, so the search-query guard passes —
    // but pairing A's profile with a new CF input name would corrupt restore.
    act(() => { result.current.setCfHandle("someoneelse"); });

    expect(stored()).toEqual(before);
    expect(stored().cfHandle).toBe("mannpatel");
  });

  it("restores masteryWeekly from the snapshot", async () => {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      handle: "mannpatel", cfHandle: "mannpatel", lcHandle: "",
      user: { handle: "mannpatel", platform: "cf" }, cfUser: { handle: "mannpatel", platform: "cf" },
      lcUser: null, tagProfile: [], weakTags: [], solvedSet: [], suggestedTopics: [],
      analysisMode: "quick", platform: "cf", combinedPlatform: false, modelUsed: "graph_dkt",
      masteryScores: {}, masteryWeekly: { cf: { dp: [{ week: "2026-W40", p: 0.4 }] }, lc: null },
      analysisRecommendations: [], analysisSelectedTopics: [], analysisActiveWeakTag: null,
    }));
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());

    expect(result.current.masteryWeekly).toEqual({
      cf: { dp: [{ week: "2026-W40", p: 0.4 }] }, lc: null,
    });
  });

  it("clearAll resets masteryWeekly", async () => {
    const useAnalysis = await loadHook();
    const { result } = renderHook(() => useAnalysis());
    await analyzeMannpatel(result);
    expect(result.current.masteryWeekly).not.toBeNull();

    act(() => { result.current.clearAll(); });
    expect(result.current.masteryWeekly).toBeNull();
  });
});
