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
      const data = await analyzeHandle(trimmed, platform, mode, controller.signal);
      if (controller.signal.aborted) return;
      const solvedSet = new Set();
      for (const t of data.topic_profile || []) {
        for (const pid of t.solved_problems || []) solvedSet.add(pid);
      }
      setTarget(trimmed);
      setResult({
        handle: data.handle || trimmed,
        platform: data.platform || platform,
        rating: data.rating ?? null,
        rank: data.rank || null,
        mastery: data.mastery_scores || {},
        solvedSet,
        modelUsed: data.model_used || "rule_based",
      });
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