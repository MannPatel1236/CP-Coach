import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor, fireEvent } from "@testing-library/react";
import CompareHandles from "./CompareHandles.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = vi.fn(); });
afterEach(() => { globalThis.fetch = originalFetch; });

// Secondary handle analyzed as "cf": mastery differs from the fixture primary on
// binary_search (0.20 → 0.45, primary −0.25 down) and geometry (0.25 → 0.15, primary +0.10 up).
const SECONDARY = {
  handle: "tourist", platform: "cf", rating: 1800, rank: "master",
  model_used: "graph_dkt",
  mastery_scores: {
    implementation: 0.98, math: 0.92, greedy: 0.79, constructive_algorithms: 0.81,
    binary_search: 0.45, two_pointers: 0.90, sortings: 0.93, strings: 0.88,
    number_theory: 0.77, combinatorics: 0.62, dfs_and_similar: 0.74, graphs: 0.80,
    trees: 0.71, dp: 0.58, dp_on_trees: 0.40, data_structures: 0.83, bitmasks: 0.24,
    divide_and_conquer: 0.70, hashing: 0.66, geometry: 0.15, flows: 0.55, brute_force: 0.95,
    prefix_sum: 0.94, sliding_window: 0.86, dsu: 0.60, shortest_paths: 0.72,
    backtracking: 0.45, string_algorithms: 0.50, matrices: 0.63,
  },
  topic_profile: [
    { topic: "binary_search", solved_problems: ["cf-1A", "cf-2B"] },
  ],
};

function okResponse(body) {
  return { ok: true, json: () => Promise.resolve(body) };
}

function err400() {
  return {
    ok: false,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ detail: "handle not found" }),
  };
}

// Primary-side "both" fetch: cf mastery mirrors the fixture primary (binary_search
// 0.20, geometry 0.25, dp 0.58) so merged primarySide == context values.
const PRIMARY_CF = {
  handle: "mannpatel", platform: "cf", model_used: "graph_dkt",
  mastery_scores: { binary_search: 0.20, geometry: 0.25, dp: 0.58 },
  topic_profile: [],
};

async function typeAndCompare(getByTestId, value) {
  fireEvent.change(getByTestId("compare-input"), { target: { value } });
  fireEvent.click(getByTestId("compare-analyze"));
}

describe("CompareHandles — §5.2 #8", () => {
  it("renders mastery-delta bars + summary when both handles resolve", async () => {
    globalThis.fetch.mockResolvedValue(okResponse(SECONDARY));
    const { container, getByTestId, queryByTestId } = renderInContext(<CompareHandles />);
    await typeAndCompare(getByTestId, "tourist");

    await waitFor(() => {
      expect(container.querySelectorAll("[data-testid='compare-delta']").length).toBeGreaterThan(0);
    });
    const binary = container.querySelector("[data-topic='binary_search']");
    expect(binary.getAttribute("data-delta")).toBe("-0.250"); // tourist up → primary −0.25
    const geometry = container.querySelector("[data-topic='geometry']");
    expect(geometry.getAttribute("data-delta")).toBe("0.100"); // primary up +0.10
    const summary = getByTestId("compare-summary").textContent;
    expect(summary).toContain("tourist leads");
    expect(summary).toContain("tourist solved 2 mannpatel hasn't"); // tourist solved 2 that mannpatel hasn't
    expect(queryByTestId("compare-estimate-badge")).toBeNull(); // both graph_dkt
  });

  it("self-compare renders an explicit same-handle message, not a misleading no-overlap panel", async () => {
    // Comparing the primary against itself: identical mastery would previously
    // fall into the deltas.length===0 branch ("No shared mastery data to diff —
    // different platforms or empty profiles"), which is factually wrong here.
    globalThis.fetch.mockResolvedValue(okResponse({ ...SECONDARY, handle: "mannpatel" }));
    const { container, getByTestId } = renderInContext(<CompareHandles />);
    await typeAndCompare(getByTestId, "mannpatel");

    await waitFor(() => {
      expect(getByTestId("compare-self")).toBeTruthy();
    });
    expect(getByTestId("compare-self").textContent).toContain("same handle");
    expect(container.querySelector("[data-testid='compare-no-overlap']")).toBeNull();
    expect(container.querySelectorAll("[data-testid='compare-delta']").length).toBe(0);
  });

  it("renders negative deltas with a true minus sign (U+2212), not hyphen-minus", async () => {
    globalThis.fetch.mockResolvedValue(okResponse(SECONDARY));
    const { container, getByTestId } = renderInContext(<CompareHandles />);
    await typeAndCompare(getByTestId, "tourist");
    await waitFor(() => {
      expect(container.querySelectorAll("[data-testid='compare-delta']").length).toBeGreaterThan(0);
    });
    const binaryRow = container.querySelector("[data-topic='binary_search']"); // primary −0.25
    const signSpan = binaryRow.querySelectorAll("span")[1]; // [0]=topic label, [1]=signed value
    expect(signSpan.textContent).toBe("−0.25"); // "−0.25" — U+2212, typographic minus
  });

  it("shows 'second handle unavailable' chip on failure, primary side still renders", async () => {
    globalThis.fetch.mockResolvedValue(err400());
    const { getByTestId, queryByTestId } = renderInContext(<CompareHandles />);
    await typeAndCompare(getByTestId, "ghost");
    await waitFor(() => { expect(getByTestId("compare-unavailable")).toBeTruthy(); });
    // Input row still present → the primary side is never blanked.
    expect(queryByTestId("compare-input")).toBeTruthy();
  });

  it("badges estimate when the secondary is rule_based (§8)", async () => {
    globalThis.fetch.mockResolvedValue(okResponse({ ...SECONDARY, model_used: "rule_based" }));
    const { container, getByTestId } = renderInContext(<CompareHandles />);
    await typeAndCompare(getByTestId, "tourist");
    await waitFor(() => { expect(getByTestId("compare-estimate-badge")).toBeTruthy(); });
    expect(container.querySelectorAll("[data-testid='compare-delta']").length).toBeGreaterThan(0);
  });

  it("supports cf+lc 'both' with separate handles — primary + secondary both analyzed per platform", async () => {
    const LC_SECONDARY = {
      ...SECONDARY,
      handle: "tourist_lc",
      platform: "lc",
      mastery_scores: { ...SECONDARY.mastery_scores, dp: 0.90, geometry: 0.60 },
      topic_profile: [{ topic: "dp", solved_problems: ["lc-dp-1"] }],
    };
    globalThis.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("platform=lc")) return Promise.resolve(okResponse(LC_SECONDARY));
      if (u.includes("mannpatel")) return Promise.resolve(okResponse(PRIMARY_CF));
      return Promise.resolve(okResponse(SECONDARY));
    });
    const { container, getByTestId } = renderInContext(<CompareHandles />);
    fireEvent.change(getByTestId("compare-platform"), { target: { value: "both" } });
    // Primary inputs appear prefilled from the analyzed context.
    await waitFor(() => { expect(getByTestId("compare-primary-cf").value).toBe("mannpatel"); });
    fireEvent.change(getByTestId("compare-input"), { target: { value: "tourist" } });
    fireEvent.change(getByTestId("compare-input-lc"), { target: { value: "tourist_lc" } });
    fireEvent.click(getByTestId("compare-analyze"));

    await waitFor(() => {
      expect(container.querySelectorAll("[data-testid='compare-delta']").length).toBeGreaterThan(0);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // primary cf + secondary cf + secondary lc
    // Merged solved sets: 2 cf (cf-1A, cf-2B) + 1 lc (lc-dp-1) exclusive to tourist.
    expect(getByTestId("compare-summary").textContent).toContain("tourist / tourist_lc solved 3 mannpatel hasn't");
    // dp only exists on the lc side → delta = primary dp 0.58 − secondary 0.90 = −0.320
    const dp = container.querySelector("[data-topic='dp']");
    expect(dp.getAttribute("data-delta")).toBe("-0.320");
  });

  it("'both' tolerates an empty LC side — falls back to cf-only", async () => {
    globalThis.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("platform=lc")) return Promise.resolve({ ok: false, status: 404 });
      if (u.includes("mannpatel")) return Promise.resolve(okResponse(PRIMARY_CF));
      return Promise.resolve(okResponse(SECONDARY));
    });
    const { container, getByTestId } = renderInContext(<CompareHandles />);
    fireEvent.change(getByTestId("compare-platform"), { target: { value: "both" } });
    await waitFor(() => { expect(getByTestId("compare-primary-cf").value).toBe("mannpatel"); });
    fireEvent.change(getByTestId("compare-input"), { target: { value: "tourist" } });
    fireEvent.click(getByTestId("compare-analyze"));

    await waitFor(() => {
      expect(container.querySelectorAll("[data-testid='compare-delta']").length).toBeGreaterThan(0);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2); // primary cf + secondary cf; lc side skipped
    expect(getByTestId("compare-summary").textContent).toContain("tourist solved 2 mannpatel hasn't");
  });

  it("'both' analyzes the primary's LC handle too when typed (asymmetric primary handles)", async () => {
    const PRIMARY_LC = {
      ...PRIMARY_CF,
      handle: "mannpatel_lc",
      platform: "lc",
      mastery_scores: { dp: 0.99 },
      topic_profile: [{ topic: "dp", solved_problems: ["lc-p-9"] }],
    };
    globalThis.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes("platform=lc")) return Promise.resolve(okResponse(PRIMARY_LC));
      if (u.includes("mannpatel")) return Promise.resolve(okResponse(PRIMARY_CF));
      return Promise.resolve(okResponse(SECONDARY));
    });
    const { container, getByTestId } = renderInContext(<CompareHandles />);
    fireEvent.change(getByTestId("compare-platform"), { target: { value: "both" } });
    await waitFor(() => { expect(getByTestId("compare-primary-cf").value).toBe("mannpatel"); });
    fireEvent.change(getByTestId("compare-primary-lc"), { target: { value: "mannpatel_lc" } });
    fireEvent.change(getByTestId("compare-input"), { target: { value: "tourist" } });
    fireEvent.click(getByTestId("compare-analyze"));

    await waitFor(() => {
      expect(container.querySelectorAll("[data-testid='compare-delta']").length).toBeGreaterThan(0);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // primary cf + primary lc + secondary cf
    // lc-p-9 lands in the primary's solved set (context ∪ fetched).
    expect(getByTestId("compare-summary").textContent).toContain("mannpatel / mannpatel_lc solved 1 problem tourist hasn't");
    // dp now primary 0.99 − secondary 0.58 = +0.410 → primary up
    const dp = container.querySelector("[data-topic='dp']");
    expect(dp.getAttribute("data-delta")).toBe("0.410");
  });

  it("does not fetch until a second handle is typed", async () => {
    const { getByTestId } = renderInContext(<CompareHandles />);
    fireEvent.click(getByTestId("compare-analyze"));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});