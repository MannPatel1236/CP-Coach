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
import { analyzeHandle, getRecommendations } from "../api/backendClient.js";

export default function useAnalysis() {
  const [handle, setHandle] = useState("");
  const [cfHandle, setCfHandle] = useState("");
  const [lcHandle, setLcHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  const [user, setUser] = useState(null);
  const [cfUser, setCfUser] = useState(null);
  const [lcUser, setLcUser] = useState(null);
  const [tagProfile, setTagProfile] = useState([]);
  const [weakTags, setWeakTags] = useState([]);
  const [solvedSet, setSolvedSet] = useState(new Set());

  const [suggestedTopics, setSuggestedTopics] = useState([]);
  const [analysisMode, setAnalysisMode] = useState("quick");
  const [platform, setPlatform] = useState("cf");
  const [combinedPlatform, setCombinedPlatform] = useState(false);

  const abortRef = useRef(null);

  // Refs to pass initial recommendations from analyze() to useRecommendations
  const analysisRecommendationsRef = useRef([]);
  const analysisSelectedTopicsRef = useRef([]);
  const analysisActiveWeakTagRef = useRef(null);
  const masteryScoresRef = useRef({});

  const resetAbort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
  }, []);

  const clearAll = useCallback(() => {
    resetAbort();
    setUser(null);
    setCfUser(null);
    setLcUser(null);
    setTagProfile([]);
    setWeakTags([]);
    setSolvedSet(new Set());
    setSuggestedTopics([]);
    setError("");
    setHandle("");
    setCfHandle("");
    setLcHandle("");
  }, [resetAbort]);

const analyze = useCallback(async () => {
    const effectiveHandle = combinedPlatform ? (cfHandle || lcHandle) : handle;
    if (!effectiveHandle?.trim() || loading) return;

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
      const useBackend = import.meta.env.VITE_API_URL;
      const isLC = platform === "lc";
      const isCombined = combinedPlatform;

      // Multi-platform unified analysis (both CF + LC)
      if (useBackend && isCombined) {
        setLoadingStep(1);
        
        // Analyze both platforms with their respective handles
        const cfData = cfHandle?.trim() 
          ? await analyzeHandle(cfHandle.trim(), "cf", analysisMode, controller?.signal).catch(() => null)
          : null;
        if (controller?.signal.aborted) return;

        setLoadingStep(2);
        const lcData = lcHandle?.trim() 
          ? await analyzeHandle(lcHandle.trim(), "lc", analysisMode, controller?.signal).catch(() => null)
          : null;
        if (controller?.signal.aborted) return;

        // Merge CF and LC data
        const cfProfile = cfData?.topic_profile || [];
        const lcProfile = lcData?.topic_profile || [];
        const mergedProfile = {};
        
        for (const t of [...cfProfile, ...lcProfile]) {
          if (!mergedProfile[t.topic]) {
            mergedProfile[t.topic] = {
              topic: t.topic,
              attempts: 0,
              solved: 0,
              solve_rate: 0,
              platform_breakdown: { cf: 0, lc: 0 },
            };
          }
          const pb = t.platform === "lc" ? "lc" : "cf";
          mergedProfile[t.topic].attempts += t.attempts;
          mergedProfile[t.topic].solved += t.solved;
          mergedProfile[t.topic].platform_breakdown[pb] += t.attempts;
        }
        
        // Recalculate solve rates after merge
        for (const topic of Object.values(mergedProfile)) {
          topic.solve_rate = topic.attempts > 0 ? topic.solved / topic.attempts : 0;
        }

        const mergedProfileArray = Object.values(mergedProfile);
        const profile = mergedProfileArray.map((t) => ({
          tag: t.topic,
          attempted: t.attempts,
          solved: t.solved,
          acRate: Math.round(t.solve_rate * 100),
        }));

        const weak = (cfData?.weak_areas || []).concat(lcData?.weak_areas || []).slice(0, 3).map((tag) => {
          const tp = profile.find((p) => p.tag === tag);
          return { tag, acRate: tp ? tp.acRate : 0 };
        });

        // Combine user info
        const userInfo = {
          handle: cfHandle && lcHandle ? `${cfHandle.trim()} / ${lcHandle.trim()}` : (cfHandle?.trim() || lcHandle?.trim() || ""),
          platform: "combined",
        };

        // Store separate platform data for rendering two cards
        const cfUserInfo = cfHandle?.trim() ? {
          handle: cfHandle.trim(),
          platform: "cf",
          rating: cfData?.rating || null,
          maxRating: cfData?.maxRating ?? cfData?.rating ?? null,
          rank: cfData?.rank || null,
          maxRank: cfData?.maxRank || null,
          avatar: cfData?.avatar || cfData?.titlePhoto || null,
          country: cfData?.country || null,
          organization: cfData?.organization || null,
        } : null;

        const lcUserInfo = lcHandle?.trim() ? {
          handle: lcHandle.trim(),
          platform: "lc",
          rating: lcData?.rating || null,
          maxRating: lcData?.maxRating ?? lcData?.rating ?? null,
          easy_solved: lcData?.easy_solved || 0,
          medium_solved: lcData?.medium_solved || 0,
          hard_solved: lcData?.hard_solved || 0,
        } : null;

        // Get combined recommendations - use CF handle as primary since it has the problem set
        setLoadingStep(3);
        const recsHandle = cfHandle?.trim() || lcHandle?.trim() || "";
        const weakTopicList = weak.map(w => w.tag).join(",");
        const recsData = await getRecommendations(recsHandle, "cf,lc", 12, controller?.signal, weakTopicList).catch(() => ({ recommendations: [] }));
        if (controller?.signal.aborted) return;

        setLoadingStep(4);
        const recommendations = recsData.recommendations || [];

        setUser(userInfo);
        setCfUser(cfUserInfo);
        setLcUser(lcUserInfo);
        setTagProfile(profile);
        setWeakTags(weak);
        setSolvedSet(new Set());
        setSuggestedTopics([]);

        analysisRecommendationsRef.current = recommendations;
        analysisSelectedTopicsRef.current = weak.length > 0 ? [weak[0].tag] : [];
        analysisActiveWeakTagRef.current = weak.length > 0 ? weak[0].tag : null;
        masteryScoresRef.current = { ...cfData?.mastery_scores, ...lcData?.mastery_scores };

      } else if (useBackend && isLC) {
        // LeetCode path: route through FastAPI backend
        setLoadingStep(1);
        const data = await analyzeHandle(handle.trim(), "lc", analysisMode, controller?.signal);
        if (controller?.signal.aborted) return;

        const profile = (data.topic_profile || []).map((t) => ({
          tag: t.topic,
          attempted: t.attempts,
          solved: t.solved,
          acRate: Math.round(t.solve_rate * 100),
        }));
        const weak = (data.weak_areas || []).map((tag) => {
          const tp = profile.find((p) => p.tag === tag);
          return { tag, acRate: tp ? tp.acRate : 0 };
        });

        setLoadingStep(2);
        const weakTopicList = weak.map(w => w.tag).join(",");
        const recsData = await getRecommendations(handle.trim(), "lc", 12, controller?.signal, weakTopicList).catch(() => ({ recommendations: [] }));
        if (controller?.signal.aborted) return;

        const userInfo = {
          handle: data.handle,
          rating: data.rating,
          platform: data.platform,
          easy_solved: data.easy_solved,
          medium_solved: data.medium_solved,
          hard_solved: data.hard_solved,
        };

        setUser(userInfo);
        setCfUser(null);
        setLcUser(userInfo);
        setTagProfile(profile);
        setWeakTags(weak);
        setSolvedSet(new Set());
        setSuggestedTopics([]);

        analysisRecommendationsRef.current = recsData.recommendations || [];
        analysisSelectedTopicsRef.current = weak.length > 0 ? [weak[0].tag] : [];
        analysisActiveWeakTagRef.current = weak.length > 0 ? weak[0].tag : null;
        masteryScoresRef.current = data.mastery_scores || {};
      } else {
        // Codeforces path: ALL existing CF logic completely untouched
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

        if (weak.length > 0) {
          setLoadingStep(4);
          const problems = await fetchProblemsForTags([weak[0].tag], controller?.signal);
          if (controller?.signal.aborted) return;
          const recommendations = buildRecommendations(problems, solved, userInfo.rating || 800);

          setUser(userInfo);
          setCfUser(null);
          setLcUser(null);
          setTagProfile(profile);
          setWeakTags(weak);
          setSolvedSet(new Set());
          setSuggestedTopics([]);

          analysisRecommendationsRef.current = recommendations;
          analysisSelectedTopicsRef.current = [weak[0].tag];
          analysisActiveWeakTagRef.current = weak[0].tag;
        } else {
          const suggested = findNextTopics(profile, userInfo.rating || 800, 5);

          setUser(userInfo);
          setCfUser(null);
          setLcUser(null);
          setTagProfile(profile);
          setWeakTags(weak);
          setSolvedSet(solved);
          setSuggestedTopics(suggested);

          analysisRecommendationsRef.current = [];
          analysisSelectedTopicsRef.current = [];
          analysisActiveWeakTagRef.current = null;
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to analyze handle. Please verify the username.");
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  }, [handle, cfHandle, lcHandle, loading, analysisMode, platform, combinedPlatform, resetAbort]);

  return {
    // State
    handle,
    setHandle,
    cfHandle,
    setCfHandle,
    lcHandle,
    setLcHandle,
    loading,
    loadingStep,
    error,
    user,
    cfUser,
    lcUser,
    tagProfile,
    weakTags,
    solvedSet,
    suggestedTopics,
    analysisMode,
    setAnalysisMode,
    platform,
    setPlatform,
    combinedPlatform,
    setCombinedPlatform,
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
    masteryScoresRef,
  };
}