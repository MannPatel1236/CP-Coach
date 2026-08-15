/* global process */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const useAnalysisSrc = readFileSync(join(process.cwd(), "src", "hooks", "useAnalysis.js"), "utf8");
const appSrc = readFileSync(join(process.cwd(), "src", "App.jsx"), "utf8");

describe("Greenhouse Phase 2 — model_used + masteryScoresRef plumbing", () => {
  it("useAnalysis declares modelUsed state and exposes it in the return", () => {
    expect(useAnalysisSrc).toMatch(/const \[modelUsed, setModelUsed\] = useState\(null\)/);
    const returnStart = useAnalysisSrc.indexOf("return {");
    expect(returnStart).toBeGreaterThan(-1);
    expect(useAnalysisSrc.slice(returnStart)).toContain("modelUsed");
  });

  it("useAnalysis resets modelUsed in clearAll", () => {
    // Scope to the clearAll function body: setModelUsed(null) now appears twice in
    // the file (clearAll + analyze() reset), so a raw .toContain matches both and
    // proves neither. Slice clearAll's useCallback body — it ends at the `}, [`
    // deps array — and assert the reset sits there (right after the masteryRef wipe).
    const start = useAnalysisSrc.indexOf("const clearAll = useCallback");
    expect(start).toBeGreaterThan(-1);
    const body = useAnalysisSrc.slice(start, useAnalysisSrc.indexOf("}, [", start));
    expect(body).toContain("setModelUsed(null)");
    expect(body).toContain("masteryScoresRef.current = {}");
  });

  it("useAnalysis also resets modelUsed at the start of analyze() (not just in clearAll)", () => {
    // modelused-not-reset-on-analyze fix: analyze()'s reset block sets
    // setModelUsed(null) right after setError("") so a re-run on a new handle never
    // carries a stale "graph_dkt"/"rule_based" badge from the previous run.
    const start = useAnalysisSrc.indexOf("const analyze = useCallback");
    expect(start).toBeGreaterThan(-1);
    const body = useAnalysisSrc.slice(start, start + 600);
    expect(body).toContain("setModelUsed(null)");
  });

  it("App.jsx surfaces modelUsed and masteryScoresRef on AnalysisContext", () => {
    // Slice the contextValue useMemo factory (from its declaration to the deps
    // array `}), [`) so the assertion isolates contextValue, not other usages
    // of masteryScoresRef elsewhere in App.jsx (it is passed to useRecommendations).
    const ctxStart = appSrc.indexOf("const contextValue = useMemo");
    expect(ctxStart).toBeGreaterThan(-1);
    const ctxFull = appSrc.slice(ctxStart, appSrc.indexOf("}), [", ctxStart));
    expect(ctxFull).toContain("modelUsed");
    expect(ctxFull).toContain("masteryScoresRef");
  });
});
