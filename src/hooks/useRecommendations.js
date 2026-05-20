import { useState, useCallback, useEffect } from "react";
import { fetchProblemsForTags, buildRecommendations } from "../api.js";
import { getRecommendations } from "../api/backendClient.js";

export default function useRecommendations({ solvedSet, user, abortRef, resetAbort, analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef, platform, combinedPlatform }) {
  const useBackend = !!import.meta.env.VITE_API_URL;
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [fetchingRecs, setFetchingRecs] = useState(false);
  const [recs, setRecs] = useState([]);
  const [activeWeakTag, setActiveWeakTag] = useState(null);
  const [initialized, setInitialized] = useState(false);

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

    const isLC = platform === "lc";
    const isCombined = combinedPlatform;

    if (useBackend && (isLC || isCombined)) {
      try {
        const handle = isCombined ? (user?.handle?.split(" / ")?.[0] || user?.handle) : user?.handle;
        const platformsStr = isCombined ? "cf,lc" : "lc";
        const data = await getRecommendations(handle, platformsStr, 12, controller?.signal, tag).catch(() => ({ recommendations: [] }));
        if (controller?.signal.aborted) return;
        setRecs(data.recommendations || []);
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
      setSelectedTopics([tag]);
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Failed to fetch problems.", err);
    } finally {
      setFetchingRecs(false);
    }
  }, [solvedSet, user, platform, combinedPlatform, useBackend, abortRef, resetAbort]);

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

    if (useBackend && (isLC || isCombined)) {
      try {
        const handle = isCombined ? (user?.handle?.split(" / ")?.[0] || user?.handle) : user?.handle;
        const platformsStr = isCombined ? "cf,lc" : "lc";
        const focusTopics = selectedTopics.join(",");
        const data = await getRecommendations(handle, platformsStr, 12, controller?.signal, focusTopics).catch(() => ({ recommendations: [] }));
        if (controller?.signal.aborted) return;
        setRecs(data.recommendations || []);
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
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Synchronization error.", err);
    } finally {
      setFetchingRecs(false);
    }
  }, [selectedTopics, fetchingRecs, solvedSet, user, platform, combinedPlatform, useBackend, abortRef, resetAbort]);

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
  };
}