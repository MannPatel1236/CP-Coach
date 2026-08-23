// Sealed-fetch scaffold shared by the Phase-4 self-fetching dashboard sections
// (RatingTrajectory / MasteryHistory / ActivityHeatmap): loading + error +
// result state, abort on unmount and re-run, manual retry. `enabled === false`
// skips the fetch entirely (the disabled-card paths). `fetcher(signal)` must
// resolve to `{ data, note? }` — map the API response inside it so each
// component keeps only its render logic. The async IIFE keeps setState off the
// synchronous effect path (react-hooks/set-state-in-effect); the cancelled flag
// mirrors useGraphLayout's pattern.
import { useState, useEffect, useRef, useCallback } from "react";

export function useSealedFetch(fetcher, enabled) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const run = useCallback(async (controller) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetcher(controller.signal);
      setData(res?.data ?? null);
      setNote(res?.note ?? "");
    } catch (err) {
      // Never surface caller-cancelled runs as errors
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => { await run(controller); if (cancelled) setLoading(false); })();
    return () => { cancelled = true; controller.abort(); };
  }, [enabled, run]);

  const retry = useCallback(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    run(controller);
  }, [run]);

  return { data, note, error, loading, retry };
}
