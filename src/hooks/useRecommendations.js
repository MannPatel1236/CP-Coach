import { useState, useCallback, useEffect } from "react";
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

  // Reset on new user search so recommendations from analyze() are picked up
  useEffect(() => {
    setInitialized(false);
    setRecs([]);
    setSelectedTopics([]);
    setActiveWeakTag(null);
    setError(null);
  }, [user?.handle]);

  // Helpers to avoid duplicated ternary logic
  const getHandle = useCallback(() => {
    const isCombined = combinedPlatform;
    return isCombined ? (user?.handle?.split(" / ")?.[0] || user?.handle) : user?.handle;
  }, [user, combinedPlatform]);

  const getPlatformsStr = useCallback(() => {
    return combinedPlatform ? "cf,lc" : platform;
  }, [combinedPlatform, platform]);

  // Initialize with recommendations from analyze() (matching original logic from ebf47fc)
  useEffect(() => {
    if (!initialized && analysisRecommendationsRef.current.length > 0) {
      setRecs(analysisRecommendationsRef.current);
      setSelectedTopics(analysisSelectedTopicsRef.current);
      setActiveWeakTag(analysisActiveWeakTagRef.current);
      setInitialized(true);
    }
  }, [initialized, analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef]);

  const selectWeakTag = useCallback(async (tag) => {
    resetAbort();
    const controller = abortRef.current;

    setActiveWeakTag(tag);
    setFetchingRecs(true);
    setRecs([]);
    setError(null);

    const isLC = platform === "lc";
    const isCombined = combinedPlatform;
    const hasMasteryScores = analysisMasteryScoresRef.current != null && Object.keys(analysisMasteryScoresRef.current).length > 0;

    if (useBackend && (isLC || isCombined || hasMasteryScores)) {
      try {
        const handle = getHandle();
        const platformsStr = getPlatformsStr();
        const solvedIds = solvedSet ? [...solvedSet] : [];
        const userRating = user?.rating || null;

        let data;
        if (hasMasteryScores) {
          data = await getRecommendationsWithMastery(handle, platformsStr, 12, controller?.signal, tag, analysisMasteryScoresRef.current, solvedIds, userRating);
        } else {
          data = await getRecommendations(handle, platformsStr, 12, controller?.signal, tag);
        }
        if (controller?.signal.aborted) return;

        // CF-only fallback: if backend returned nothing, use client-side recs
        if (!data || (data.recommendations || []).length === 0) {
          if (!isLC && !isCombined) {
            const problems = await fetchProblemsForTags([tag], controller?.signal);
            if (controller?.signal.aborted) return;
            const fallbackRecs = buildRecommendations(problems, solvedSet, user?.rating || 800);
            setRecs(fallbackRecs);
            setSelectedTopics([tag]);
            return;
          }
        }

        setRecs(data?.recommendations || []);
        setSelectedTopics([tag]);
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "Failed to load recommendations.");
        console.error("Failed to fetch recommendations from backend.", err);
      } finally {
        setFetchingRecs(false);
      }
      return;
    }

    try {
      const problems = await fetchProblemsForTags([tag], controller?.signal);
      if (controller?.signal.aborted) return;
      const recommendations = buildRecommendations(problems, solvedSet, user?.rating || 800);
      setRecs(recommendations);
      setSelectedTopics([tag]);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Failed to fetch problems.", err);
    } finally {
      setFetchingRecs(false);
    }
  }, [solvedSet, user, platform, combinedPlatform, useBackend, abortRef, resetAbort, analysisMasteryScoresRef, getHandle, getPlatformsStr]);

  const toggleTopic = useCallback((tag) => {
    setSelectedTopics((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const fetchForSelectedTopics = useCallback(async () => {
    if (!selectedTopics.length || fetchingRecs) return;

    resetAbort();
    const controller = abortRef.current;

    setFetchingRecs(true);
    setRecs([]);
    setError(null);

    const isLC = platform === "lc";
    const isCombined = combinedPlatform;
    const hasMasteryScores = analysisMasteryScoresRef.current != null && Object.keys(analysisMasteryScoresRef.current).length > 0;

    if (useBackend && (isLC || isCombined || hasMasteryScores)) {
      try {
        const handle = getHandle();
        const platformsStr = getPlatformsStr();
        const focusTopics = selectedTopics.join(",");
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
            const problems = await fetchProblemsForTags(selectedTopics, controller?.signal);
            if (controller?.signal.aborted) return;
            const fallbackRecs = buildRecommendations(problems, solvedSet, user?.rating || 800);
            setRecs(fallbackRecs);
            return;
          }
        }

        setRecs(data?.recommendations || []);
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message || "Failed to load recommendations.");
        console.error("Failed to fetch recommendations from backend.", err);
      } finally {
        setFetchingRecs(false);
      }
      return;
    }

    try {
      const problems = await fetchProblemsForTags(selectedTopics, controller?.signal);
      if (controller?.signal.aborted) return;
      const recommendations = buildRecommendations(problems, solvedSet, user?.rating || 800);
      setRecs(recommendations);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Synchronization error.", err);
    } finally {
      setFetchingRecs(false);
    }
  }, [selectedTopics, fetchingRecs, solvedSet, user, platform, combinedPlatform, useBackend, abortRef, resetAbort, analysisMasteryScoresRef, getHandle, getPlatformsStr]);

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