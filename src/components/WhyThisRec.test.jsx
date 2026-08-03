import { describe, it, expect } from "vitest";
import WhyThisRec from "./WhyThisRec.jsx";
import { renderInContext, baseContext } from "../__fixtures__/analysisContext.jsx";
import { prereqPath, FALLBACK_GRAPH } from "../lib/topicGraphLayout.js";

const TRIGGER = baseContext.activeWeakTag; // "binary_search"

describe("WhyThisRec — breadcrumb + band + margin", () => {
  it("renders the prereq chain from implementation to the active weak tag", () => {
    const { getByTestId } = renderInContext(<WhyThisRec />);
    const bc = getByTestId("whyrec-path").textContent;
    expect(bc).toContain("implementation");
    expect(bc).toContain(TRIGGER.replace(/_/g, " ")); // "binary search"
    // chain length = BFS depth + 1
    const expected = prereqPath(FALLBACK_GRAPH.edges, TRIGGER);
    expect(bc.split("→").map(s => s.trim()).filter(Boolean).length).toBeGreaterThanOrEqual(expected.length);
  });

  it("renders the difficulty band from bandFor(userRating) (1500 → 1400–1900)", () => {
    const { getByTestId } = renderInContext(<WhyThisRec />);
    const band = getByTestId("whyrec-band").textContent;
    expect(band).toContain("1400");
    expect(band).toContain("1900");
  });

  it("renders the margin vs the next rec (recs[0].difficulty - recs[1].difficulty = 1500-1700 = -200)", () => {
    const { getByTestId } = renderInContext(<WhyThisRec />);
    expect(getByTestId("whyrec-margin").textContent).toContain("200");
  });
});

describe("WhyThisRec — §8 provenance badge", () => {
  it("badges when modelUsed !== 'graph_dkt'", () => {
    const { getByTestId, queryByTestId } = renderInContext(<WhyThisRec />, { modelUsed: "rule_based" });
    expect(getByTestId("estimate-badge")).toBeTruthy();
    expect(queryByTestId("estimate-badge").textContent).toMatch(/estimate.*not.*graph-dkt/i);
  });

  it("omits the badge when modelUsed === 'graph_dkt'", () => {
    const { queryByTestId } = renderInContext(<WhyThisRec />, { modelUsed: "graph_dkt" });
    expect(queryByTestId("estimate-badge")).toBeNull();
  });
});

describe("WhyThisRec — Phase-4d forward compatibility", () => {
  it("uses server provenance when recs[0].provenance is present (skips client derive)", () => {
    const withProv = [{
      ...baseContext.recommendations[0],
      provenance: { trigger_weak_tag: "dp", prereq_path: ["implementation", "math", "greedy", "dp"], band: [1400, 1900], margin_vs_next: 777 },
    }, baseContext.recommendations[1]];
    const { getByTestId } = renderInContext(<WhyThisRec />, { recommendations: withProv });
    // Server prereq_path ends at "dp", NOT the activeWeakTag "binary_search" → proves server value won
    expect(getByTestId("whyrec-path").textContent).toContain("dp");
    expect(getByTestId("whyrec-path").textContent).not.toContain("binary search");
    expect(getByTestId("whyrec-margin").textContent).toContain("777");
  });

  it("renders nothing when there are no recommendations", () => {
    const { container } = renderInContext(<WhyThisRec />, { recommendations: [] });
    expect(container.firstChild).toBeNull();
  });
});
