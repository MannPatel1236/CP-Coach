import { useState, useCallback, useEffect } from "react";
import { fetchProblemsForTags, buildRecommendations } from "../api.js";
import { getRecommendations, getRecommendationsWithMastery } from "../api/backendClient.js";

export default function useRecommendations({ solvedSet, user, abortRef, resetAbort, analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef, analysisMasteryScoresRef, analysisModelUsedRef, platform, combinedPlatform }) {
  const useBackend = !!import.meta.env.VITE_API_URL;
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [fetchingRecs, setFetchingRecs] = useState(false);
  const [recs, setRecs] = useState([]);
  const [activeWeakTag, setActiveWeakTag] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [modelUsed, setModelUsed] = useState(null);

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
      setModelUsed(analysisModelUsedRef?.current || null);
      setInitialized(true);
    }
  }, [initialized, analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef, analysisModelUsedRef]);

  const selectWeakTag = useCallback(async (tag) => {
    resetAbort();
    const controller = abortRef.current;

    setActiveWeakTag(tag);
    setFetchingRecs(true);
    setRecs([]);

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
          data = await getRecommendationsWithMastery(handle, platformsStr, 12, controller?.signal, tag, analysisMasteryScoresRef.current, solvedIds, userRating)
            .catch((e) => { console.warn("Recommendation POST failed:", e); return null; });
        } else {
          data = await getRecommendations(handle, platformsStr, 12, controller?.signal, tag)
            .catch((e) => { console.warn("Recommendation GET failed:", e); return null; });
        }
        if (controller?.signal.aborted) return;

        // CF-only fallback: if backend returned nothing, use client-side recs
        if (!data || (data.recommendations || []).length === 0) {
          if (!isLC && !isCombined) {
            const problems = await fetchProblemsForTags([tag], controller?.signal);
            if (controller?.signal.aborted) return;
            const fallbackRecs = buildRecommendations(problems, solvedSet, user?.rating || 800);
            setRecs(fallbackRecs);
            setModelUsed("rule_based");
            setSelectedTopics([tag]);
            return;
          }
        }

        setRecs(data?.recommendations || []);
        setModelUsed(data?.model_used || null);
        setSelectedTopics([tag]);
      } catch (err) {
        if (err.name === "AbortError") return;
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
      setModelUsed("rule_based");
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
          data = await getRecommendationsWithMastery(handle, platformsStr, 12, controller?.signal, focusTopics, analysisMasteryScoresRef.current, solvedIds, userRating)
            .catch((e) => { console.warn("Recommendation POST failed:", e); return null; });
        } else {
          data = await getRecommendations(handle, platformsStr, 12, controller?.signal, focusTopics)
            .catch((e) => { console.warn("Recommendation GET failed:", e); return null; });
        }
        if (controller?.signal.aborted) return;

        // CF-only fallback: if backend returned nothing, use client-side recs
        if (!data || (data.recommendations || []).length === 0) {
          if (!isLC && !isCombined) {
            const problems = await fetchProblemsForTags(selectedTopics, controller?.signal);
            if (controller?.signal.aborted) return;
            const fallbackRecs = buildRecommendations(problems, solvedSet, user?.rating || 800);
            setRecs(fallbackRecs);
            setModelUsed("rule_based");
            return;
          }
        }

        setRecs(data?.recommendations || []);
        setModelUsed(data?.model_used || null);
      } catch (err) {
        if (err.name === "AbortError") return;
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
      setModelUsed("rule_based");
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
    modelUsed,
  };
}