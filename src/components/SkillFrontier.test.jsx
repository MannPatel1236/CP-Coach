import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import SkillFrontier from "./SkillFrontier.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

// jsdom does not implement fetch, so /api/graph rejects → SkillFrontier renders
// FALLBACK_GRAPH (§8 fallback). Mocking at file scope keeps every test deterministic
// (no real network) and lets the cached-chip test assert fromFallback directly.
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => Promise.reject(new Error("offline")); });
afterEach(() => { globalThis.fetch = originalFetch; });

async function nodesMounted(container) {
  await waitFor(() => {
    expect(container.querySelectorAll("svg g[role='button']").length).toBeGreaterThan(0);
  });
  return container.querySelectorAll("svg g[role='button']");
}

describe("SkillFrontier — render", () => {
  it("paints nodes from fixture mastery (weak = mastery < 0.5) after async dagre layout", async () => {
    const { container } = renderInContext(<SkillFrontier />);
    await nodesMounted(container);
    const bs = container.querySelector('g[aria-label^="binary search mastery"]');
    expect(bs.getAttribute("data-weak")).toBe("true");
    expect(bs.getAttribute("data-mastery")).toBe("0.20");
    const impl = container.querySelector('g[aria-label^="implementation mastery"]');
    expect(impl.getAttribute("data-weak")).toBe("false");
    expect(container.querySelectorAll("svg g[role='button']").length).toBe(29);
  });

  it("reveals the prerequisite chain on node click; second click deselects", async () => {
    const { container, getByTestId } = renderInContext(<SkillFrontier />);
    await nodesMounted(container);
    const dp = container.querySelector('g[aria-label^="dp mastery"]');
    fireEvent.click(dp);
    const readout = getByTestId("chain-readout").textContent;
    expect(readout).toContain("implementation");
    expect(readout).toContain("dp");
    expect(container.querySelectorAll('g[data-on-path="true"]').length).toBeGreaterThanOrEqual(4);
    fireEvent.click(dp);
    expect(() => getByTestId("chain-readout")).toThrow();
  });

  it("keyboard-activates a node with Enter (same as click)", async () => {
    const { container, getByTestId } = renderInContext(<SkillFrontier />);
    await nodesMounted(container);
    const greedy = container.querySelector('g[aria-label^="greedy mastery"]');
    fireEvent.keyDown(greedy, { key: "Enter" });
    expect(getByTestId("chain-readout").textContent).toContain("greedy");
  });

  it("keyboard-activates a node with Space and prevents scroll", async () => {
    const { container, getByTestId } = renderInContext(<SkillFrontier />);
    await nodesMounted(container);
    const nt = container.querySelector('g[aria-label^="number theory mastery"]');
    const ev = fireEvent.keyDown(nt, { key: " " });
    expect(ev).toBe(false);                 // preventDefault was called → Space didn't scroll
    expect(getByTestId("chain-readout").textContent).toContain("number theory");
  });

  it("frontier-focus bridges the selected topic into the rec engine (selectWeakTag)", async () => {
    const selectWeakTag = vi.fn();
    const { container, getByTestId } = renderInContext(<SkillFrontier />, { selectWeakTag });
    await nodesMounted(container);

    const dp = container.querySelector('g[aria-label^="dp mastery"]');
    fireEvent.click(dp);
    expect(() => getByTestId("frontier-focus")).not.toThrow();

    // Not yet the active focus → plain label; click routes through the same
    // selectWeakTag path as the WeakAreas chips.
    expect(getByTestId("frontier-focus").textContent).toContain("Focus recommendations");
    fireEvent.click(getByTestId("frontier-focus"));
    expect(selectWeakTag).toHaveBeenCalledWith("dp");

    // Already-focused selection flips the affordance to a refocus label.
    fireEvent.click(container.querySelector('g[aria-label^="binary search mastery"]'));
    expect(getByTestId("frontier-focus").textContent).toContain("Refocus recommendations");
  });
});

describe("SkillFrontier — §8 provenance + fallback", () => {
  // fetch is mocked at file scope (reject → FALLBACK_GRAPH) — see beforeEach above.

  it("shows the 'estimate · not graph-dkt' badge when modelUsed !== 'graph_dkt'", async () => {
    const { container, getByTestId } = renderInContext(<SkillFrontier />, { modelUsed: "rule_based" });
    await nodesMounted(container);   // SkillFrontier returns null until the graph fetch settles
    const badge = getByTestId("estimate-badge");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toMatch(/estimate.*not.*graph-dkt/i);
  });

  it("omits the badge when modelUsed === 'graph_dkt'", async () => {
    const { container, queryByTestId } = renderInContext(<SkillFrontier />, { modelUsed: "graph_dkt" });
    await nodesMounted(container);
    expect(queryByTestId("estimate-badge")).toBeNull();
  });

  it("uses FALLBACK_GRAPH and shows the cached chip when /api/graph rejects", async () => {
    const { container, findByTestId } = renderInContext(<SkillFrontier />);
    await waitFor(() => expect(container.querySelectorAll("svg g[role='button']").length).toBe(29));
    expect(await findByTestId("cached-chip")).toBeTruthy();
  });
});

describe("SkillFrontier — §9 sibling text summary", () => {
  it("lists the top weak topics in text (not image-only)", async () => {
    // SkillFrontier returns null until the /api/graph fetch settles — await the
    // summary (findByTestId) like the other tests await nodesMounted.
    const { findByTestId } = renderInContext(<SkillFrontier />);
    const summary = (await findByTestId("frontier-summary")).textContent;
    expect(summary).toContain("binary_search");
    expect(summary).toContain("bitmasks");
    expect(summary).toContain("geometry");
  });
});

describe("SkillFrontier — weekly mastery chart", () => {
  it("shows the weekly chart for the selected topic when Graph-DKT data exists", async () => {
    const { container, getByTestId } = renderInContext(<SkillFrontier />);
    await nodesMounted(container);
    fireEvent.click(container.querySelector('g[aria-label^="dp mastery"]'));
    expect(getByTestId("weekly-chart")).toBeTruthy();
    expect(container.querySelector('[data-testid="weekly-line-CF"]')).toBeTruthy();
    const summary = getByTestId("weekly-summary").textContent;
    expect(summary).toContain("50%");
    expect(summary).toContain("+10 pts");
  });

  it("shows the disabled caption when modelUsed is not graph_dkt", async () => {
    const { container, getByTestId } = renderInContext(<SkillFrontier />, { modelUsed: "rule_based" });
    await nodesMounted(container);
    fireEvent.click(container.querySelector('g[aria-label^="dp mastery"]'));
    expect(getByTestId("weekly-disabled")).toBeTruthy();
  });

  it("shows the empty caption for a topic with no weekly data", async () => {
    const { container, getByTestId } = renderInContext(<SkillFrontier />);
    await nodesMounted(container);
    fireEvent.click(container.querySelector('g[aria-label^="implementation mastery"]'));
    expect(getByTestId("weekly-empty")).toBeTruthy();
  });
});
