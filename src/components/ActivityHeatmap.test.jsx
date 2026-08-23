import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import ActivityHeatmap from "./ActivityHeatmap.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = vi.fn(); });
afterEach(() => { globalThis.fetch = originalFetch; });

// Three consecutive active weeks (streak of 3), then one inactive week (breaks
// current streak to 0 if it's the latest), then two more active.
const ACTIVITY = {
  "2026-W27": { solved: 2, total: 3, active_days: 2 },
  "2026-W28": { solved: 1, total: 2, active_days: 1 },
  "2026-W29": { solved: 4, total: 5, active_days: 3 },
  "2026-W30": { solved: 0, total: 0, active_days: 0 },
  "2026-W31": { solved: 3, total: 4, active_days: 2 },
  "2026-W32": { solved: 5, total: 6, active_days: 3 },
};

async function gridMounted(container) {
  await waitFor(() => {
    expect(container.querySelectorAll("[data-testid='heat-cell']").length).toBeGreaterThan(0);
  });
}

describe("ActivityHeatmap + Streaks — §5.2 #7", () => {
  it("renders the 12-week heat grid + streak chips from fetched activity", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", topic_progress: {}, activity: ACTIVITY }),
    });
    const { container, getByTestId } = renderInContext(<ActivityHeatmap />);
    await gridMounted(container);
    const cells = container.querySelectorAll("[data-testid='heat-cell']");
    expect(cells.length).toBeLessThanOrEqual(12);
    // W32 (latest, solved 5) > 0 → current streak counts back over W31 only (W30 gap)
    const summary = getByTestId("heat-summary").textContent;
    expect(summary).toContain("longest streak 3");
    expect(summary).toContain("current streak 2");
    expect(container.querySelector("[data-week='2026-W32']").getAttribute("data-solved")).toBe("5");
  });

  it("renders on the rule_based path too (no mastery dependency)", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", topic_progress: {}, activity: ACTIVITY }),
    });
    const { container } = renderInContext(<ActivityHeatmap />, { modelUsed: "rule_based" });
    await gridMounted(container);
    expect(container.querySelectorAll("[data-testid='heat-cell']").length).toBeGreaterThan(0);
  });

  it("sealed empty-state on API failure, retry refetches", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ detail: "backend down" }),
    });
    const { container, getByTestId } = renderInContext(<ActivityHeatmap />);
    await waitFor(() => { expect(getByTestId("heat-error")).toBeTruthy(); });
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", topic_progress: {}, activity: ACTIVITY }),
    });
    getByTestId("heat-retry").click();
    await gridMounted(container);
    expect(container.querySelectorAll("[data-testid='heat-cell']").length).toBeGreaterThan(0);
  });

  it("renders the empty caption when no activity exists", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", topic_progress: {}, activity: {} }),
    });
    const { getByTestId } = renderInContext(<ActivityHeatmap />);
    await waitFor(() => { expect(getByTestId("heat-empty")).toBeTruthy(); });
  });

  it("fetches with platform=lc when only lcHandle is set (regression: client hardcoded cf)", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "lcuser", platform: "lc", topic_progress: {}, activity: ACTIVITY }),
    });
    const { container } = renderInContext(<ActivityHeatmap />, { cfHandle: "", lcHandle: "lcuser" });
    await gridMounted(container);
    const url = String(globalThis.fetch.mock.calls[0][0]);
    expect(url).toContain("/api/progress/lcuser?platform=lc");
  });

  it("prefers cf when both handles are set", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", topic_progress: {}, activity: ACTIVITY }),
    });
    const { container } = renderInContext(<ActivityHeatmap />, { cfHandle: "mannpatel", lcHandle: "lcuser" });
    await gridMounted(container);
    const url = String(globalThis.fetch.mock.calls[0][0]);
    expect(url).toContain("/api/progress/mannpatel?platform=cf");
  });
});