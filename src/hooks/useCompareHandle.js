// Greenhouse Phase 5a — useCompareHandle.
// Localized secondary-handle analysis (spec §4): the compare target NEVER lives in
// the primary AnalysisContext. Owns its AbortController with the same abort
// discipline as useAnalysis; reuses the existing analyzeHandle endpoint (0 new
// backend surface per §11 row 5a). Result shape normalizes the analyze payload
// into {mastery, solvedSet, modelUsed, user} for the Compare diff.
import { useState, useCallback, useRef, useEffect } from "react";
import { analyzeHandle } from "../api/backendClient.js";

export default function useCompareHandle() {
  const [target, setTarget] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const resetAbort = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
  }, []);

  // Abort in-flight requests on unmount to prevent setState on unmounted component.
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const run = useCallback(async (handles, platform, mode = "quick") => {
    resetAbort();
    const controller = abortRef.current;
    setLoading(true);
    setError("");
    try {
      const trimmed = String(handles && typeof handles === "object" ? handles.cf || "" : handles || "").trim();
      const build = (data, p) => {
        const solvedSet = new Set();
        for (const t of data.topic_profile || []) {
          for (const pid of t.solved_problems || []) solvedSet.add(pid);
        }
        return {
          handle: data.handle || trimmed,
          platform: data.platform || p,
          rating: data.rating ?? null,
          rank: data.rank || null,
          mastery: data.mastery_scores || {},
          solvedSet,
          modelUsed: data.model_used || "rule_based",
        };
      };

      if (platform === "both") {
        // Handles differ per platform: {cf, lc}. Empty sides are skipped; a
        // missing profile on one side is tolerated (allSettled).
        const requests = [];
        if (handles.cf?.trim()) requests.push(["cf", handles.cf.trim()]);
        if (handles.lc?.trim()) requests.push(["lc", handles.lc.trim()]);
        if (requests.length === 0) return;
        const settled = await Promise.allSettled(
          requests.map(([p, h]) => analyzeHandle(h, p, mode, controller.signal))
        );
        if (controller.signal.aborted) return;
        const parts = [];
        for (let i = 0; i < settled.length; i++) {
          if (settled[i].status === "fulfilled") parts.push(build(settled[i].value, requests[i][0]));
        }
        if (parts.length === 0) {
          const first = settled.find((s) => s.status === "rejected");
          throw first ? first.reason : new Error("Failed to analyze the second handle.");
        }
        const allGraphDkt = parts.every((p) => p.modelUsed === "graph_dkt");
        const targetLabel = parts.map((p) => p.handle).join(" / ");
        setTarget(targetLabel);
        setResult({
          handle: targetLabel,
          platform: parts.length === 2 ? "cf+lc" : parts[0].platform,
          rating: parts[0].rating ?? parts[1]?.rating ?? null,
          rank: parts[0].rank || parts[1]?.rank || null,
          mastery: { ...parts[0].mastery, ...(parts[1] ? parts[1].mastery : {}) },
          solvedSet: new Set(parts.flatMap((p) => [...p.solvedSet])),
          modelUsed: allGraphDkt ? "graph_dkt" : "rule_based",
        });
        return;
      }

      if (!trimmed) return;
      const data = await analyzeHandle(trimmed, platform, mode, controller.signal);
      if (controller.signal.aborted) return;
      setTarget(trimmed);
      setResult(build(data, platform));
    } catch (err) {
      if (err.name === "AbortError") return;
      // Aborted runs can reject with non-AbortError shapes (e.g. a TypeError
      // from fetch teardown) — never surface those as errors either.
      if (controller.signal.aborted) return;
      setError(err.message || "Failed to analyze the second handle.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [resetAbort]);

  const clear = useCallback(() => {
    resetAbort();
    setResult(null);
    setTarget("");
    setError("");
    setLoading(false);
  }, [resetAbort]);

  return { target, result, loading, error, run, clear };
}