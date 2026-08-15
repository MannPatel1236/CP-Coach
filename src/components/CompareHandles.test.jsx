import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor, fireEvent } from "@testing-library/react";
import CompareHandles from "./CompareHandles.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = vi.fn(); });
afterEach(() => { globalThis.fetch = originalFetch; });

// Secondary handle analyzed as "cf": mastery differs from the fixture primary on
// binary_search (0.20 → 0.45, +0.25 up) and geometry (0.25 → 0.15, −0.10 down).
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

async function typeAndCompare(getByTestId, value) {
  fireEvent.change(getByTestId("compare-input"), { target: { value } });
  getByTestId("compare-analyze").click();
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
    expect(binary.getAttribute("data-delta")).toBe("0.250"); // +0.25 up
    const geometry = container.querySelector("[data-topic='geometry']");
    expect(geometry.getAttribute("data-delta")).toBe("-0.100"); // −0.10 down
    const summary = getByTestId("compare-summary").textContent;
    expect(summary).toContain("tourist leads");
    expect(summary).toContain("tourist solved 2 mannpatel hasn't"); // tourist solved 2 that mannpatel hasn't
    expect(queryByTestId("compare-estimate-badge")).toBeNull(); // both graph_dkt
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

  it("does not fetch until a second handle is typed", async () => {
    const { getByTestId } = renderInContext(<CompareHandles />);
    getByTestId("compare-analyze").click();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});