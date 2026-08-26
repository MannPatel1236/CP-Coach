import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor, act } from "@testing-library/react";
import MasteryHistory from "./MasteryHistory.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = vi.fn(); });
afterEach(() => { globalThis.fetch = originalFetch; });

const HISTORY = {
  binary_search: [
    { ts: 1600000000000, p: 0.12 }, { ts: 1600864000000, p: 0.2 }, { ts: 1601728000000, p: 0.34 },
  ],
  bitmasks: [
    { ts: 1600000000000, p: 0.22 }, { ts: 1600864000000, p: 0.24 }, { ts: 1601728000000, p: 0.28 },
  ],
  geometry: [
    { ts: 1600000000000, p: 0.4 }, { ts: 1600864000000, p: 0.42 }, { ts: 1601728000000, p: 0.45 },
  ],
  dp: [
    { ts: 1600000000000, p: 0.5 }, { ts: 1600864000000, p: 0.51 }, { ts: 1601728000000, p: 0.53 },
  ],
};

async function rowsMounted(container) {
  await waitFor(() => {
    expect(container.querySelectorAll("[data-testid='mastery-row']").length).toBeGreaterThan(0);
  });
}

describe("MasteryHistory — §5.2 #6", () => {
  it("renders the disabled caption on the rule-based path and never fetches", async () => {
    const { getByTestId } = renderInContext(<MasteryHistory />, { modelUsed: "rule_based" });
    expect(getByTestId("mastery-disabled").textContent).toContain("requires the Graph-DKT model");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("renders sparkline rows + sibling summary from fetched history", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", mastery_history: HISTORY, note: null }),
    });
    const { container, getByTestId } = renderInContext(<MasteryHistory />);
    await rowsMounted(container);
    const summary = getByTestId("mastery-summary").textContent;
    expect(summary).toContain("3");
    expect(summary).toContain("4");
    expect(summary).toContain("binary search");
    expect(container.querySelectorAll("[data-testid='mastery-sparkline']").length).toBe(4);
  });

  it("sealed empty-state on API failure, retry refetches", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ detail: "backend down" }),
    });
    const { container, getByTestId } = renderInContext(<MasteryHistory />);
    await waitFor(() => { expect(getByTestId("mastery-error")).toBeTruthy(); });
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", mastery_history: HISTORY, note: null }),
    });
    act(() => { getByTestId("mastery-retry").click(); });
    await rowsMounted(container);
    expect(container.querySelectorAll("[data-testid='mastery-row']").length).toBe(4);
  });

  it("renders the backend note when no snapshot exists yet", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", mastery_history: null, note: "No mastery history yet — run a deep analyze while Graph-DKT is loaded." }),
    });
    const { getByTestId } = renderInContext(<MasteryHistory />);
    await waitFor(() => { expect(getByTestId("mastery-note").textContent).toContain("No mastery history yet"); });
  });

  it("fetches with platform=lc when only lcHandle is set (regression: client hardcoded cf)", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "lcuser", platform: "lc", mastery_history: HISTORY, note: null }),
    });
    const { container } = renderInContext(<MasteryHistory />, { cfHandle: "", lcHandle: "lcuser" });
    await rowsMounted(container);
    const url = String(globalThis.fetch.mock.calls[0][0]);
    expect(url).toContain("/api/mastery-history/lcuser?platform=lc");
  });

  it("prefers cf when both handles are set", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", mastery_history: HISTORY, note: null }),
    });
    const { container } = renderInContext(<MasteryHistory />, { cfHandle: "mannpatel", lcHandle: "lcuser" });
    await rowsMounted(container);
    const url = String(globalThis.fetch.mock.calls[0][0]);
    expect(url).toContain("/api/mastery-history/mannpatel?platform=cf");
  });
});