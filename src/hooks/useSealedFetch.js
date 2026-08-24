// Sealed-fetch scaffold shared by the Phase-4 self-fetching dashboard sections
// (RatingTrajectory / MasteryHistory / ActivityHeatmap): loading + error +
// result state, abort on unmount and re-run, manual retry. `enabled === false`
// skips the fetch entirely (the disabled-card paths). `fetcher(signal)` must
// resolve to `{ data, note? }` — map the API response inside it so each
// component keeps only its render logic. The async IIFE keeps setState off the
// synchronous effect path (react-hooks/set-state-in-effect); the cancelled flag
// mirrors useGraphLayout's pattern.
//
// Race safety: every run gets a monotonically increasing epoch and its own
// AbortController (kept in a ref). A retry aborts the in-flight run before
// starting, and stale resolves are dropped by the epoch check, so a slow
// earlier fetch can never overwrite a newer result. The effect-path controller
// is the same ref slot, so unmount also cancels whatever is in flight —
// including a fetch started from retry().
import { useState, useEffect, useCallback, useRef } from "react";

export function useSealedFetch(fetcher, enabled) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const runIdRef = useRef(0);
  const controllerRef = useRef(null);

  const run = useCallback(async () => {
    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const runId = ++runIdRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetcher(controller.signal);
      if (runId !== runIdRef.current) return; // superseded by a newer run
      setData(res?.data ?? null);
      setNote(res?.note ?? "");
    } catch (err) {
      // Never surface caller-cancelled runs as errors
      if (err.name === "AbortError") return;
      if (runId !== runIdRef.current) return;
      setError(err.message || "Failed to load.");
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => { await run(); if (cancelled) setLoading(false); })();
    // Cleanup runs on disable AND unmount: cancel whatever run is in flight
    // (effect-started or retry-started — both share the ref slot).
    return () => {
      cancelled = true;
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, [enabled, run]);

  const retry = useCallback(() => {
    void run();
  }, [run]);

  return { data, note, error, loading, retry };
}
