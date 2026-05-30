import { useState, useCallback, useEffect, useRef } from "react";
import { fetchProblemsForTags, buildRecommendations } from "../api.js";
import { getRecommendations, getRecommendationsWithMastery } from "../api/backendClient.js";

export default function useRecommendations({ solvedSet, user, abortRef, resetAbort, analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef, analysisMasteryScoresRef, platform, combinedPlatform }) {
  const useBackend = !!import.meta.env.VITE_API_URL;
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [fetchingRecs, setFetchingRecs] = useState(false);
  const [recs, setRecs] = useState([]);
  const [activeWeakTag, setActiveWeakTag] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState(null);

  const prevHandleRef = useRef(null);

  // Reset on new user search so recommendations from analyze() are picked up
  if (user?.handle !== prevHandleRef.current) {
    prevHandleRef.current = user?.handle;
    setInitialized(false);
    setRecs([]);
    setSelectedTopics([]);
    setActiveWeakTag(null);
    setError(null);
  }

  // Abort in-flight requests on unmount — read abortRef.current at unmount time
  // (not at mount time) so we catch any request started after the effect mounted.
  useEffect(() => {
    return () => {
      /* abortRef is a manually-managed AbortController, not a React DOM ref — stale-access
         warning is a false positive here. suppress it inline. */
      // eslint-disable-next-line react-hooks/exhaustive-deps
      abortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Helpers to avoid duplicated ternary logic
  const getHandle = useCallback(() => {
    const isCombined = combinedPlatform;
    return isCombined ? (user?.handle?.split(" / ")?.[0] || user?.handle) : user?.handle;
  }, [user, combinedPlatform]);

  const getPlatformsStr = useCallback(() => {
    return combinedPlatform ? "cf,lc" : platform;
  }, [combinedPlatform, platform]);

  // Initialize with recommendations from analyze()
  useEffect(() => {
    if (!initialized && analysisRecommendationsRef.current.length > 0) {
      setRecs(analysisRecommendationsRef.current);
      setSelectedTopics(analysisSelectedTopicsRef.current);
      setActiveWeakTag(analysisActiveWeakTagRef.current);
      setInitialized(true);
    }
  }, [initialized, analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef]);

  // Shared recommendation fetch — called by selectWeakTag and fetchForSelectedTopics
  const fetchRecommendations = useCallback(async (topics) => {
    if (!topics.length) return;

    resetAbort();
    const controller = abortRef.current;

    setFetchingRecs(true);
    setRecs([]);
    setError(null);

    const isLC = platform === "lc";
    const isCombined = combinedPlatform;
    const hasMasteryScores = analysisMasteryScoresRef.current != null && Object.keys(analysisMasteryScoresRef.current).length > 0;

    const focusTopics = topics.join(",");

    if (useBackend && (isLC || isCombined || hasMasteryScores)) {
      try {
        const handle = getHandle();
        const platformsStr = getPlatformsStr();
        const solvedIds = solvedSet ? [...solvedSet] : [];
        const userRating = user?.rating || null;

        let data;
        if (hasMasteryScores) {
          data = await getRecommendationsWithMastery(handle, platformsStr, 12, controller?.signal, focusTopics, analysisMasteryScoresRef.current, solvedIds, userRating);
        } else {
          data = await getRecommendations(handle, platformsStr, 12, controller?.signal, focusTopics);
        }
        if (controller?.signal.aborted) return;

        // CF-only fallback: if backend returned nothing, use client-side recs
        if (!data || (data.recommendations || []).length === 0) {
          if (!isLC && !isCombined) {
            const problems = await fetchProblemsForTags(topics, controller?.signal);
            if (controller?.signal.aborted) return;
            const fallbackRecs = buildRecommendations(problems, solvedSet, user?.rating || 800);
            setRecs(fallbackRecs);
            setSelectedTopics(topics);
            return;
          }
        }

        setRecs(data?.recommendations || []);
        setSelectedTopics(topics);
      } catch (err) {
        if (err.name === "AbortError") return;
        // CF-only failover: try client-side before giving up
        if (!isLC && !isCombined) {
          try {
            const problems = await fetchProblemsForTags(topics, controller?.signal);
            if (controller?.signal.aborted) return;
            setRecs(buildRecommendations(problems, solvedSet, user?.rating || 800));
            setSelectedTopics(topics);
            setFetchingRecs(false);
            return;
          } catch {
            // pass through to setError
          }
        }
        setError(err.message || "Failed to load recommendations.");
        console.error("Failed to fetch recommendations from backend.", err);
      } finally {
        setFetchingRecs(false);
      }
      return;
    }

    // Client-only path
    try {
      const problems = await fetchProblemsForTags(topics, controller?.signal);
      if (controller?.signal.aborted) return;
      const recommendations = buildRecommendations(problems, solvedSet, user?.rating || 800);
      setRecs(recommendations);
      setSelectedTopics(topics);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Failed to fetch problems.", err);
    } finally {
      setFetchingRecs(false);
    }
  }, [solvedSet, user, platform, combinedPlatform, useBackend, abortRef, resetAbort, analysisMasteryScoresRef, getHandle, getPlatformsStr]);

  const selectWeakTag = useCallback(async (tag) => {
    setActiveWeakTag(tag);
    await fetchRecommendations([tag]);
  }, [fetchRecommendations]);

  const toggleTopic = useCallback((tag) => {
    setSelectedTopics((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const fetchForSelectedTopics = useCallback(async () => {
    if (!selectedTopics.length || fetchingRecs) return;
    await fetchRecommendations(selectedTopics);
  }, [selectedTopics, fetchingRecs, fetchRecommendations]);

  return {
    selectedTopics,
    setSelectedTopics,
    fetchingRecs,
    recs,
    setRecs,
    activeWeakTag,
    setActiveWeakTag,
    selectWeakTag,
    toggleTopic,
    fetchForSelectedTopics,
    error,
  };
}
