import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import TopicWeeklyChart from "./TopicWeeklyChart.jsx";

const WEEKS = Array.from({ length: 12 }, (_, i) => `2026-W${String(29 + i).padStart(2, "0")}`);

describe("TopicWeeklyChart", () => {
  it("renders one line and the current/previous/delta readout", () => {
    const points = [null, null, 0.2, 0.3, 0.35, 0.35, 0.4, 0.4, 0.45, 0.5, 0.55, 0.62];
    const series = [{ label: "CF", points, weeks: WEEKS.map((w, i) => (i < 2 ? null : w)) }];
    const { container, getByTestId } = render(
      <TopicWeeklyChart topic="dp" weeks={series[0].weeks} series={series} />
    );
    expect(container.querySelector('[data-testid="weekly-line-CF"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="weekly-line-LC"]')).toBeNull();
    expect(container.querySelector('[data-testid="weekly-legend"]')).toBeNull();
    const summary = getByTestId("weekly-summary").textContent;
    expect(summary).toContain("62%");
    expect(summary).toContain("55%");
    expect(summary).toContain("+7 pts");
  });

  it("renders two lines and a legend when both platforms have data", () => {
    const series = [
      { label: "CF", points: WEEKS.map((_, i) => 0.4 + i * 0.01), weeks: WEEKS },
      { label: "LC", points: WEEKS.map((_, i) => 0.3 + i * 0.01), weeks: WEEKS },
    ];
    const { container, getByTestId } = render(
      <TopicWeeklyChart topic="dp" weeks={WEEKS} series={series} />
    );
    expect(container.querySelector('[data-testid="weekly-line-CF"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="weekly-line-LC"]')).toBeTruthy();
    expect(getByTestId("weekly-legend").textContent).toContain("CF");
    expect(getByTestId("weekly-legend").textContent).toContain("LC");
  });

  it("shows an em-dash delta when the previous week is null", () => {
    const points = [...WEEKS.slice(0, 11).map(() => null), 0.5];
    const series = [{ label: "CF", points, weeks: WEEKS.map((w, i) => (i < 11 ? null : w)) }];
    const { getByTestId } = render(
      <TopicWeeklyChart topic="dp" weeks={series[0].weeks} series={series} />
    );
    expect(getByTestId("weekly-summary").textContent).toContain("—");
  });

  it("shows the empty caption when there is no series", () => {
    const { getByTestId, queryByTestId } = render(
      <TopicWeeklyChart topic="dp" weeks={[]} series={[]} />
    );
    expect(getByTestId("weekly-empty")).toBeTruthy();
    expect(queryByTestId("weekly-chart")).toBeNull();
  });

  it("shows a hover tooltip with the week and score when interactive", () => {
    const points = [null, 0.1, 0.2, 0.3, 0.35, 0.35, 0.4, 0.4, 0.45, 0.5, 0.55, 0.62];
    const series = [{ label: "CF", points, weeks: WEEKS }];
    const { getByTestId, queryByTestId, container } = render(
      <TopicWeeklyChart topic="dp" weeks={WEEKS} series={series} interactive />
    );
    expect(queryByTestId("weekly-tooltip")).toBeNull();
    const hit = container.querySelector('[data-testid="weekly-hit-11"]');
    expect(hit).toBeTruthy();
    fireEvent.mouseEnter(hit);
    const tip = getByTestId("weekly-tooltip").textContent;
    expect(tip).toContain("2026-W40");
    expect(tip).toContain("62%");
    fireEvent.mouseLeave(hit);
    expect(queryByTestId("weekly-tooltip")).toBeNull();
  });

  it("does not render hover hit areas when not interactive", () => {
    const series = [{ label: "CF", points: WEEKS.map(() => 0.5), weeks: WEEKS }];
    const { container } = render(<TopicWeeklyChart topic="dp" weeks={WEEKS} series={series} />);
    expect(container.querySelector('[data-testid="weekly-hit-11"]')).toBeNull();
  });
});
