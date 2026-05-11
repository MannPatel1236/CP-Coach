import { useState, useCallback, useEffect } from "react";
import { fetchProblemsForTags, buildRecommendations } from "../api.js";

export default function useRecommendations({ solvedSet, user, abortRef, resetAbort, analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef }) {
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
  }, [solvedSet, user?.rating, abortRef, resetAbort]);

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
  }, [selectedTopics, fetchingRecs, solvedSet, user?.rating, abortRef, resetAbort]);

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