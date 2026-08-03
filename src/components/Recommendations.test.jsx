/* global process */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Recommendations from "./Recommendations.jsx";
import { renderInContext, baseContext } from "../__fixtures__/analysisContext.jsx";

const recSrc = readFileSync(join(process.cwd(), "src", "components", "Recommendations.jsx"), "utf8");

// Recommendations takes recs/userRating/selectedTopics as PROPS (App.jsx:167-170
// passes them explicitly), so this test passes props directly — renderInContext is
// used only as the Provider wrapper (harmless if the component never reads context).
function recsForRender() {
  // baseContext.recommendations are backend-format rec objects (problem_id-prefixed);
  // Recommendations.jsx's normalizeRec handles that shape.
  return baseContext.recommendations;
}

describe("Recommendations — restyle to Phase-1 tokens (source-string)", () => {
  it("uses --dur-med and --ease-out-expo in transitions (not raw 0.3s cubic-bezier)", () => {
    expect(recSrc).toContain("var(--dur-med)");
    expect(recSrc).toContain("var(--ease-out-expo)");
    expect(recSrc).not.toContain("0.3s cubic-bezier(0.4, 0, 0.2, 1)");
  });

  it("uses --color-accent-text for small mono labels (pinned to the mono-meta block)", () => {
    // A bare toContain would pass even if --color-accent-text were substituted at a
    // WRONG --text-muted site (lines 129/257/265). Pin the accent to the mono-meta
    // block (line 224: fontSize 10 + fontWeight 600 + fontFamily var(--font-mono)):
    // the regex only matches when the accent sits exactly in that block.
    expect(recSrc).toMatch(/fontSize: 10,\s+color: "var\(--color-accent-text\)",\s+fontWeight: 600,\s+fontFamily: "var\(--font-mono\)"/);
  });

  it("derives the difficulty band from bandFor (not inline lo/hi)", () => {
    expect(recSrc).toContain("bandFor");
    expect(recSrc).not.toContain("const lo = Math.max(BASE_RECOMMEND_RATING");
  });
});

describe("Recommendations — render", () => {
  it("renders the fixture recs with names and the Difficulty Range line from bandFor(1500)", () => {
    const { getByText, container } = renderInContext(
      <Recommendations
        recs={recsForRender()}
        userRating={1500}
        selectedTopics={["binary_search"]}
      />
    );
    // bandFor(1500) = { lo: 1400, hi: 1900 } — the existing "Difficulty Range: X – Y" copy.
    expect(getByText(/1400/)).toBeTruthy();
    expect(getByText(/1900/)).toBeTruthy();
    expect(container.textContent).toContain("Binary Search Walk");
    expect(container.textContent).toContain("Bitmask Count");
  });
});
