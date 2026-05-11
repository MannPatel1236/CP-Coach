import { useState, useCallback, useRef } from "react";
import {
  fetchUserInfo,
  fetchSubmissions,
  fetchProblemsForTags,
  buildTagProfile,
  findWeakTags,
  buildRecommendations,
  findNextTopics,
} from "../api.js";

export default function useAnalysis() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  const [user, setUser] = useState(null);
  const [tagProfile, setTagProfile] = useState([]);
  const [weakTags, setWeakTags] = useState([]);
  const [solvedSet, setSolvedSet] = useState(new Set());

  const [suggestedTopics, setSuggestedTopics] = useState([]);
  const [analysisMode, setAnalysisMode] = useState("quick");

  const abortRef = useRef(null);

  // Refs to pass initial recommendations from analyze() to useRecommendations
  const analysisRecommendationsRef = useRef([]);
  const analysisSelectedTopicsRef = useRef([]);
  const analysisActiveWeakTagRef = useRef(null);

  const resetAbort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
  }, []);

  const clearAll = useCallback(() => {
    resetAbort();
    setUser(null);
    setTagProfile([]);
    setWeakTags([]);
    setSolvedSet(new Set());
    setSuggestedTopics([]);
    setError("");
    setHandle("");
  }, [resetAbort]);

  const analyze = useCallback(async () => {
    if (!handle.trim() || loading) return;

    resetAbort();
    const controller = abortRef.current;

    setLoading(true);
    setError("");
    setUser(null);
    setTagProfile([]);
    setWeakTags([]);
    setSolvedSet(new Set());
    setSuggestedTopics([]);

    try {
      setLoadingStep(1);
      const userInfo = await fetchUserInfo(handle.trim(), controller?.signal);
      if (controller?.signal.aborted) return;

      setLoadingStep(2);
      const submissions = await fetchSubmissions(handle.trim(), analysisMode, controller?.signal);
      if (controller?.signal.aborted) return;

      setLoadingStep(3);
      const { profile, solvedSet: solved } = buildTagProfile(submissions);
      const weak = findWeakTags(profile);

      if (controller?.signal.aborted) return;

      // Auto-fetch recommendations for first weak tag (matching original logic from ebf47fc)
      if (weak.length > 0) {
        setLoadingStep(4);
        const problems = await fetchProblemsForTags([weak[0].tag], controller?.signal);
        if (controller?.signal.aborted) return;
        const recommendations = buildRecommendations(problems, solved, userInfo.rating || 800);

        setUser(userInfo);
        setTagProfile(profile);
        setWeakTags(weak);
        setSolvedSet(solved);
        setSuggestedTopics([]);

        // Store recommendations in a ref so we can pass them to useRecommendations
        analysisRecommendationsRef.current = recommendations;
        analysisSelectedTopicsRef.current = [weak[0].tag];
        analysisActiveWeakTagRef.current = weak[0].tag;
      } else {
        const suggested = findNextTopics(profile, userInfo.rating || 800, 5);

        setUser(userInfo);
        setTagProfile(profile);
        setWeakTags(weak);
        setSolvedSet(solved);
        setSuggestedTopics(suggested);

        analysisRecommendationsRef.current = [];
        analysisSelectedTopicsRef.current = [];
        analysisActiveWeakTagRef.current = null;
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to analyze handle. Please verify the username.");
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  }, [handle, loading, analysisMode, resetAbort]);

  return {
    // State
    handle,
    setHandle,
    loading,
    loadingStep,
    error,
    user,
    tagProfile,
    weakTags,
    solvedSet,
    suggestedTopics,
    analysisMode,
    setAnalysisMode,
    // Actions
    analyze,
    clearAll,
    // Shared
    abortRef,
    resetAbort,
    // Initial recommendations from analyze()
    analysisRecommendationsRef,
    analysisSelectedTopicsRef,
    analysisActiveWeakTagRef,
  };
}