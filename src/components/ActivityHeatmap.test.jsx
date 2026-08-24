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

  it("slices to exactly 12 cells and computes streaks from the RENDERED window only", async () => {
    // 14 weeks: W18–W21 hold a 4-active-run OUTSIDE the 12-week window; inside
    // the window only W32/W33 are active. The caption claims "last N weeks",
    // so longest/current must never count the out-of-window run.
    const activity = {};
    for (let w = 18; w <= 33; w += 1) {
      activity[`2026-W${w}`] = { solved: 0, total: 0, active_days: 0 };
    }
    for (let w = 18; w <= 21; w += 1) activity[`2026-W${w}`] = { solved: 2, total: 2, active_days: 2 };
    activity["2026-W32"] = { solved: 3, total: 3, active_days: 1 };
    activity["2026-W33"] = { solved: 4, total: 4, active_days: 2 };

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", topic_progress: {}, activity }),
    });
    const { container, getByTestId } = renderInContext(<ActivityHeatmap />);
    await gridMounted(container);
    const cells = container.querySelectorAll("[data-testid='heat-cell']");
    expect(cells.length).toBe(12);
    expect(cells[0].getAttribute("data-week")).toBe("2026-W22"); // oldest dropped
    const summary = getByTestId("heat-summary").textContent;
    expect(summary).toContain("longest streak 2");
    expect(summary).toContain("current streak 2");
  });

  it("zero-filled trailing inactive week renders current streak 0 (not a phantom)", async () => {
    // Latest week inactive → current streak must be 0 even though W28–W29 ran.
    const activity = {
      "2026-W27": { solved: 2, total: 2, active_days: 1 },
      "2026-W28": { solved: 3, total: 3, active_days: 2 },
      "2026-W29": { solved: 0, total: 0, active_days: 0 },
    };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", topic_progress: {}, activity }),
    });
    const { getByTestId } = renderInContext(<ActivityHeatmap />);
    await waitFor(() => {
      expect(getByTestId("heat-summary").textContent).toContain("current streak 0");
    });
    expect(getByTestId("heat-summary").textContent).toContain("longest streak 2");
  });
});