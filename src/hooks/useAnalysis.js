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
import { analyzeHandle, getRecommendations, getRecommendationsWithMastery } from "../api/backendClient.js";

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
  const modelUsedRef = useRef(null);

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

        // Merge mastery scores BEFORE fetching recommendations so POST can use them
        const mergedMastery = { ...cfData?.mastery_scores, ...lcData?.mastery_scores };
        masteryScoresRef.current = mergedMastery;

        // Get combined recommendations - use POST with mastery for Graph-DKT
        setLoadingStep(3);
        const recsHandle = cfHandle?.trim() || lcHandle?.trim() || "";
        const weakTopicList = weak.map(w => w.tag).join(",");
        const recsData = Object.keys(mergedMastery).length > 0
          ? await getRecommendationsWithMastery(recsHandle, "cf,lc", 12, controller?.signal, weakTopicList, mergedMastery)
              .catch((e) => { console.warn("Combined POST recs failed, falling back:", e); return { recommendations: [], model_used: "rule_based" }; })
          : await getRecommendations(recsHandle, "cf,lc", 12, controller?.signal, weakTopicList)
              .catch(() => ({ recommendations: [], model_used: "rule_based" }));
        if (controller?.signal.aborted) return;

        setLoadingStep(4);
        const recommendations = recsData.recommendations || [];
        modelUsedRef.current = recsData.model_used || null;

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
        masteryScoresRef.current = data.mastery_scores || {};

        let recsData;
        if (Object.keys(masteryScoresRef.current).length > 0) {
          recsData = await getRecommendationsWithMastery(handle.trim(), "lc", 12, controller?.signal, weakTopicList, masteryScoresRef.current)
            .catch((e) => { console.warn("LC POST recs failed, falling back:", e); return { recommendations: [], model_used: "rule_based" }; });
        } else {
          recsData = await getRecommendations(handle.trim(), "lc", 12, controller?.signal, weakTopicList)
            .catch(() => ({ recommendations: [], model_used: "rule_based" }));
        }
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
        modelUsedRef.current = recsData.model_used || null;
      } else {
        // Codeforces path: existing CF logic + mastery score computation
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

        // Populate masteryScoresRef for Graph-DKT recommendations
        if (useBackend) {
          const cfData = await analyzeHandle(handle.trim(), "cf", analysisMode, controller?.signal).catch(() => null);
          if (cfData?.mastery_scores) {
            masteryScoresRef.current = cfData.mastery_scores;
          }
        } else {
          // Client-side approximation: solve_rate per topic
          const scores = {};
          for (const t of profile) {
            scores[t.tag] = t.acRate / 100;
          }
          masteryScoresRef.current = scores;
        }

        if (weak.length > 0) {
          setLoadingStep(4);

          let recommendations;
          if (useBackend && Object.keys(masteryScoresRef.current).length > 0) {
            // Use backend POST with mastery scores for Graph-DKT recommendations
            const weakTopicList = weak[0].tag;
            const recsData = await getRecommendationsWithMastery(
              handle.trim(), "cf", 12, controller?.signal, weakTopicList, masteryScoresRef.current
            ).catch((e) => { console.warn("CF POST recs failed, falling back:", e); return { recommendations: [], model_used: "rule_based" }; });
            if (controller?.signal.aborted) return;
            recommendations = recsData.recommendations || [];
            modelUsedRef.current = recsData.model_used || null;
          } else {
            // Client-side fallback
            const problems = await fetchProblemsForTags([weak[0].tag], controller?.signal);
            if (controller?.signal.aborted) return;
            recommendations = buildRecommendations(problems, solved, userInfo.rating || 800);
            modelUsedRef.current = "rule_based";
          }

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
    modelUsedRef,
  };
}