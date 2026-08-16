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

  const run = useCallback(async (handle, platform, mode = "quick") => {
    const trimmed = (handle || "").trim();
    if (!trimmed) return;
    resetAbort();
    const controller = abortRef.current;
    setLoading(true);
    setError("");
    try {
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
        // Parallel cf + lc; tolerate a missing profile on one side (allSettled).
        const settled = await Promise.allSettled([
          analyzeHandle(trimmed, "cf", mode, controller.signal),
          analyzeHandle(trimmed, "lc", mode, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const fulfilled = settled
          .filter((s) => s.status === "fulfilled")
          .map((s) => s.value);
        if (fulfilled.length === 0) {
          const first = settled.find((s) => s.status === "rejected");
          throw first ? first.reason : new Error("Failed to analyze the second handle.");
        }
        const parts = fulfilled.map((d, i) => build(d, i === 0 ? "cf" : "lc"));
        const bothModels = parts.every((p) => p.modelUsed === "graph_dkt");
        setTarget(trimmed);
        setResult({
          handle: trimmed,
          platform: parts.length === 2 ? "cf+lc" : parts[0].platform,
          rating: parts[0].rating ?? parts[1]?.rating ?? null,
          rank: parts[0].rank || parts[1]?.rank || null,
          mastery: { ...parts[0].mastery, ...(parts[1] ? parts[1].mastery : {}) },
          solvedSet: new Set(parts.flatMap((p) => [...p.solvedSet])),
          modelUsed: bothModels ? "graph_dkt" : "rule_based",
        });
        return;
      }

      const data = await analyzeHandle(trimmed, platform, mode, controller.signal);
      if (controller.signal.aborted) return;
      setTarget(trimmed);
      setResult(build(data, platform));
    } catch (err) {
      if (err.name === "AbortError") return;
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