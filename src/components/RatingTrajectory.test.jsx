import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor, act } from "@testing-library/react";
import RatingTrajectory from "./RatingTrajectory.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

const originalFetch = globalThis.fetch;

const POINTS = [
  { contest_id: 1000, contest_name: "Round 1", rank: 500, old_rating: 1400, new_rating: 1500, timestamp: 1600000000 },
  { contest_id: 1001, contest_name: "Round 2", rank: 300, old_rating: 1500, new_rating: 1600, timestamp: 1601000000 },
  { contest_id: 1002, contest_name: "Round 3", rank: 400, old_rating: 1600, new_rating: 1550, timestamp: 1602000000 },
];

beforeEach(() => { globalThis.fetch = vi.fn(); });
afterEach(() => { globalThis.fetch = originalFetch; });

async function chartMounted(container) {
  await waitFor(() => { expect(container.querySelector("svg[data-testid='traj-chart']")).toBeTruthy(); });
}

describe("RatingTrajectory — §5.2 #5", () => {
  it("renders the disabled caption when no CF handle is present", async () => {
    const { getByTestId } = renderInContext(<RatingTrajectory />, { cfHandle: "" });
    expect(getByTestId("traj-disabled").textContent).toContain("only available for Codeforces handles");
  });

  it("renders the SVG line chart + sibling summary from fetched points", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", points: POINTS }),
    });
    const { container, getByTestId } = renderInContext(<RatingTrajectory />);
    await chartMounted(container);
    expect(container.querySelector("path[data-testid='traj-line']")).toBeTruthy();
    const summary = getByTestId("traj-summary").textContent;
    expect(summary).toContain("3");
    expect(summary).toContain("1600");
  });

  it("sealed empty-state when the API fails, retry refetches", async () => {
    // 400-style response — apiFetch does NOT retry non-5xx, so the error surfaces
    // immediately (a network reject would retry 2× with backoff, outlasting waitFor).
    globalThis.fetch.mockResolvedValue({
      ok: false,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ detail: "CF API unavailable" }),
    });
    const { container, getByTestId } = renderInContext(<RatingTrajectory />);
    await waitFor(() => { expect(getByTestId("traj-error")).toBeTruthy(); });
    const retry = getByTestId("traj-retry");
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", points: POINTS }),
    });
    act(() => { retry.click(); });
    await chartMounted(container);
    expect(container.querySelector("svg[data-testid='traj-chart']")).toBeTruthy();
  });

  it("empty points list renders the no-contests caption", async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ handle: "mannpatel", platform: "cf", points: [] }),
    });
    const { getByTestId } = renderInContext(<RatingTrajectory />);
    await waitFor(() => { expect(getByTestId("traj-empty")).toBeTruthy(); });
  });
});