import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { waitFor } from "@testing-library/react";
import LandingPage from "./LandingPage.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";

// fetch rejects → FALLBACK_GRAPH inside the embedded LandingDAG. Mirrors SkillFrontier.test.
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => Promise.reject(new Error("offline")); });
afterEach(() => { globalThis.fetch = originalFetch; });

// framer-motion whileInView builds an IntersectionObserver from a layout effect; jsdom has
// none and framer-motion assumes a browser → without a stub, render() throws. Non-capturing:
// framer-motion registers and never fires; the embedded LandingDAG's nodes are gated on
// layout (not visible), so the SVG still renders. (LandingDAG's own test uses a capturing
// stub; this one must stay non-capturing so the page's section reveals don't fire draws.)
const IO = class { constructor() {} observe() {} unobserve() {} disconnect() {} };
const originalIO = globalThis.IntersectionObserver;
beforeEach(() => { globalThis.IntersectionObserver = IO; });
afterEach(() => { globalThis.IntersectionObserver = originalIO; });

describe("LandingPage — lane-05 editorial narrative (§5.1)", () => {
  it("renders the hero headline 'Where do you stand on the graph?'", async () => {
    const { container } = renderInContext(<LandingPage />);
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    expect(container.querySelector("h1").textContent).toContain("Where do you stand");
  });

  it("shows the credibility micro-strip under the CTA (skill graph, CF + LC)", async () => {
    const { container } = renderInContext(<LandingPage />);
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    const strip = container.querySelector("[data-testid='credibility-strip']");
    expect(strip).toBeTruthy();
    expect(strip.textContent).toContain("29");
    expect(strip.textContent).toContain("CF + LC");
  });

  it("embeds the LandingDAG centerpiece — 29 nodes render, caption present (not image-only)", async () => {
    const { container, getByTestId } = renderInContext(<LandingPage />);
    await waitFor(() => expect(container.querySelectorAll("svg g.ld-node").length).toBe(29));
    expect(getByTestId("dag-caption")).toBeTruthy();
  });

  it("tells the streak story (general CP observation, no paper stats) in text", async () => {
    const { container } = renderInContext(<LandingPage />);
    await waitFor(() => expect(container.querySelector("h1")).toBeTruthy());
    const story = container.querySelector("[data-testid='self-selection-story']");
    expect(story).toBeTruthy();
    expect(story.textContent).toContain("streaks");
  });
});