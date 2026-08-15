/* global process */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Convention from useAnalysis.test.js: source-string guards over renderHook. The
// hook delegates to async membrane effects (fetch + dagre layout) inside useEffect;
// mounting it would require jsdom timing + lib spying for one file, reinventing a
// mechanism the repo avoids. String guards pin the contract that was extracted.
const src = readFileSync(join(process.cwd(), "src", "hooks", "useGraphLayout.js"), "utf8");

describe("useGraphLayout — extraction contract (source guards)", () => {
  it("imports the three lib primitives it proxies (fetchTopicGraph, getLayout, topicDepths)", () => {
    expect(src).toMatch(
      /import\s+\{\s*fetchTopicGraph,\s*getLayout,\s*topicDepths\s*\}\s+from\s+"\.\.\/lib\/topicGraphLayout\.js"/
    );
  });

  it("exports a default hook (defaults to be consumed by SkillFrontier + LandingDAG)", () => {
    expect(src).toMatch(/export default function useGraphLayout\(\s*\)/);
  });

  it("folds depths into the return so consumers share one topicDepths call (no recompute)", () => {
    // the hook must OWN depths: both consumers destructure { depths } from it, and
    // neither re-runs topicDepths. The useMemo lifts topicDepths off graphData edges,
    // keyed on graphData itself.
    const returnIdx = src.indexOf("return {");
    expect(returnIdx).toBeGreaterThan(-1);
    expect(src.slice(returnIdx)).toMatch(/\{\s*graphData,\s*layout,\s*depths\s*\}/);
    expect(src).toMatch(/const depths = useMemo\(\s*\(\)\s*=>\s*topicDepths\(/);
  });

  it("does not accept args (fetchTopicGraph is zero-arg, getLayout takes graphData)", () => {
    // fetch-speculative-params fix: fetchTopicGraph() takes no signal/base. The hook
    // must call it bare — passing args would contradict that fix.
    expect(src).toMatch(/await fetchTopicGraph\(\s*\)/);
    expect(src).toMatch(/await getLayout\(graphData\.edges,\s*graphData\.nodes\)/);
  });

  it("guards both effects against post-unmount state sets (stale-cancel)", () => {
    // two useEffect blocks, two `let cancelled = false;` + two cancel returns.
    const cancelledMatches = src.match(/let cancelled = false/g) || [];
    expect(cancelledMatches.length).toBe(2);
  });
});