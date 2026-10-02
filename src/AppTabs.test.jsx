import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import App from "./App.jsx";
import { baseContext } from "./__fixtures__/analysisContext.jsx";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.scrollTo = () => {};
  globalThis.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes("/api/graph")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ nodes: [], edges: [] }) });
    if (u.includes("/api/rating-trajectory")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", points: [] }) });
    if (u.includes("/api/mastery-history")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ mastery_history: null, note: "" }) });
    if (u.includes("/api/progress")) return Promise.resolve({ ok: true, json: () => Promise.resolve({ activity: {} }) });
    if (u.includes("/api/plans")) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  window.history.replaceState(null, "", "/");
});

// Full analyzed fixture — App also passes analysis refs into useRecommendations,
// so the mock adds the same pass-through shape useAnalysis provides at runtime.
vi.mock("./hooks/useAnalysis.js", () => ({
  default: () => ({
    ...baseContext,
    abortRef: { current: null },
    resetAbort: () => {},
    analysisRecommendationsRef: { current: [] },
    analysisSelectedTopicsRef: { current: [] },
    analysisActiveWeakTagRef: { current: null },
  }),
}));

describe("AppTabs — Phase 6 Step 4 (zero-refetch proof)", () => {
  it("tab switching never re-fetches (all panels permanently mounted)", async () => {
    const { getByTestId, container } = render(<App />);

    // Baseline: the 4 self-fetching sections fire exactly once on mount.
    // (Mastery history is no longer one of them — it renders the weekly curve
    // straight from the analyze payload.)
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.length).toBe(4);
    });
    const baseline = globalThis.fetch.mock.calls.length;

    for (const tab of ["analytics", "compare", "workbook", "practice"]) {
      fireEvent.click(getByTestId(`nav-tab-${tab}`));
    }

    expect(globalThis.fetch.mock.calls.length).toBe(baseline);

    // Final active tab is practice; the other three panels carry hidden + inert.
    const practice = container.querySelector("#panel-practice");
    const analytics = container.querySelector("#panel-analytics");
    const compare = container.querySelector("#panel-compare");
    const workbook = container.querySelector("#panel-workbook");
    expect(practice.hasAttribute("hidden")).toBe(false);
    expect(practice.hasAttribute("inert")).toBe(false);
    for (const panel of [analytics, compare, workbook]) {
      expect(panel.hasAttribute("hidden")).toBe(true);
      expect(panel.getAttribute("inert")).toBe("");
      expect(panel.getAttribute("aria-labelledby")).toBe(`tab-${panel.id.replace("panel-", "")}`);
    }

    // Settle SkillFrontier's async dagre layout (useGraphLayout) before the
    // test ends — otherwise its post-await setLayout lands outside act() and
    // emits a flaky not-wrapped-in-act warning (~1 in 6 runs).
    await waitFor(() => {
      expect(container.querySelector("[data-testid='frontier-summary']")).toBeTruthy();
    });
  });
});

describe("AppTabs — hash routing contract", () => {
  it("restores the deep-linked tab from the URL hash on load", () => {
    window.history.replaceState(null, "", "/#analytics");
    const { container } = render(<App />);

    expect(container.querySelector("#panel-analytics").hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("#panel-practice").hasAttribute("hidden")).toBe(true);
  });

  it("falls back to practice for an unknown hash (in memory — URL untouched until a switch)", () => {
    window.history.replaceState(null, "", "/#garbage");
    const { container } = render(<App />);

    expect(container.querySelector("#panel-practice").hasAttribute("hidden")).toBe(false);
    expect(window.location.hash).toBe("#garbage");
  });

  it("switchTab writes the tab hash; going home strips it entirely", () => {
    const { container, getByTestId } = render(<App />);

    fireEvent.click(getByTestId("nav-tab-workbook"));
    expect(window.location.hash).toBe("#workbook");

    // Header logo = home: dashboard state clears AND the URL drops the tab hash
    // (a "#practice" hash on the landing page would deep-link to nothing).
    fireEvent.click(container.querySelector(".header-logo-group"));
    expect(window.location.hash).toBe("");
    expect(container.querySelector("#panel-practice").hasAttribute("hidden")).toBe(false);
  });
});