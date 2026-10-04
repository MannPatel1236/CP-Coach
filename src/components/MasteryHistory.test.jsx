import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import MasteryHistory from "./MasteryHistory.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = vi.fn(); });
afterEach(() => { globalThis.fetch = originalFetch; });

const SERIES = [null, null, null, null, null, null, null, null, null, null, { week: "2026-W39", p: 0.3 }, { week: "2026-W40", p: 0.4 }];

describe("MasteryHistory — weekly curve (Analytics)", () => {
  it("renders the disabled caption on the rule-based path and never fetches", () => {
    const { getByTestId } = renderInContext(<MasteryHistory />, { modelUsed: "rule_based" });
    expect(getByTestId("mastery-disabled").textContent).toContain("requires the Graph-DKT model");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("renders the weekly chart for the default topic and does not fetch", () => {
    const { getByTestId, container } = renderInContext(<MasteryHistory />);
    expect(getByTestId("mastery-topic-select").value).toBe("dp");
    expect(getByTestId("weekly-chart")).toBeTruthy();
    expect(container.querySelector('[data-testid="weekly-line-CF"]')).toBeTruthy();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("defaults to the weakest weak tag that has weekly data", () => {
    const masteryWeekly = {
      cf: {
        binary_search: SERIES,
        dp: SERIES,
      },
      lc: null,
    };
    const { getByTestId } = renderInContext(<MasteryHistory />, { masteryWeekly });
    expect(getByTestId("mastery-topic-select").value).toBe("binary_search");
  });

  it("changing the topic select switches the chart data", () => {
    const { getByTestId } = renderInContext(<MasteryHistory />);
    fireEvent.change(getByTestId("mastery-topic-select"), { target: { value: "implementation" } });
    expect(getByTestId("weekly-empty")).toBeTruthy();
  });

  it("renders the no-data note when the analysis has no weekly payload", () => {
    const { getByTestId } = renderInContext(<MasteryHistory />, { masteryWeekly: null });
    expect(getByTestId("mastery-note").textContent).toContain("No weekly mastery data");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("exposes hover tooltips on the Analytics chart", () => {
    const { getByTestId, queryByTestId, container } = renderInContext(<MasteryHistory />);
    expect(queryByTestId("weekly-tooltip")).toBeNull();
    const hit = container.querySelector('[data-testid="weekly-hit-11"]');
    expect(hit).toBeTruthy();
    fireEvent.mouseEnter(hit);
    const tip = getByTestId("weekly-tooltip").textContent;
    expect(tip).toContain("2026-W40");
    expect(tip).toContain("50%");
  });
});
