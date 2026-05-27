import { useState, useCallback, useRef, useEffect } from "react";
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

  const resetAbort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();
  }, []);

  // Abort in-flight requests on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
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
    analysisRecommendationsRef.current = [];
    analysisSelectedTopicsRef.current = [];
    analysisActiveWeakTagRef.current = null;
    masteryScoresRef.current = {};
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

      // Guard: LC and combined modes require the backend
      if (!useBackend && (isLC || isCombined)) {
        throw new Error(
          "LeetCode analysis requires the backend service. Please set VITE_API_URL or switch to Codeforces."
        );
      }

      // Multi-platform unified analysis (both CF + LC)
      if (useBackend && isCombined) {
        setLoadingStep(1);
        
        // Analyze both platforms with their respective handles
        const cfData = cfHandle?.trim()
          ? await analyzeHandle(cfHandle.trim(), "cf", analysisMode, controller?.signal).catch(e => {
              console.warn("CF backend analysis failed:", e);
              return { _error: e.message || "CF analysis failed" };
            })
          : null;
        if (controller?.signal.aborted) return;

        setLoadingStep(2);
        const lcData = lcHandle?.trim()
          ? await analyzeHandle(lcHandle.trim(), "lc", analysisMode, controller?.signal).catch(e => {
              console.warn("LC backend analysis failed:", e);
              return { _error: e.message || "LC analysis failed" };
            })
          : null;
        if (controller?.signal.aborted) return;

        // Track per-platform errors
        const platformErrors = [];
        if (cfData?._error) platformErrors.push(cfData._error);
        if (lcData?._error) platformErrors.push(lcData._error);
        if (platformErrors.length === 2) {
          throw new Error("Analysis failed for both platforms. Please verify the usernames and try again.");
        }

        // Merge CF and LC data
        const cfProfile = cfData?.topic_profile || [];
        const lcProfile = lcData?.topic_profile || [];
        const mergedProfile = {};

        // Track per-platform attempts so breakdown is accurate
        const _add = (arr, source) => {
          for (const t of arr) {
            if (!mergedProfile[t.topic]) {
              mergedProfile[t.topic] = { topic: t.topic, solved: 0, cf_attempts: 0, lc_attempts: 0 };
            }
            if (source === "cf") {
              mergedProfile[t.topic].cf_attempts += t.attempts;
            } else {
              mergedProfile[t.topic].lc_attempts += t.attempts;
            }
            // Union of solved problems — avoid double-counting if CF and LC share problem IDs
            if (!mergedProfile[t.topic].solvedSet) {
              mergedProfile[t.topic].solvedSet = new Set();
            }
            for (const pid of t.solved_problems || []) {
              mergedProfile[t.topic].solvedSet.add(pid);
            }
          }
        };
        _add(cfProfile, "cf");
        _add(lcProfile, "lc");

        // Convert to uniform shape
        for (const topic of Object.values(mergedProfile)) {
          const attempts = topic.cf_attempts + topic.lc_attempts;
          topic.attempts = attempts;
          topic.solved = topic.solvedSet.size;
          topic.solve_rate = attempts > 0 ? topic.solved / attempts : 0;
          topic.platform_breakdown = { cf: topic.cf_attempts, lc: topic.lc_attempts };
        }

        const mergedProfileArray = Object.values(mergedProfile);
        const profile = mergedProfileArray.map((t) => ({
          tag: t.topic,
          attempts: t.attempts,
          solved: t.solved,
          acRate: Math.round(t.solve_rate * 100),
        }));

        // Deduplicate weak areas and rank by lowest AC rate
        const seenWeak = new Set();
        const allWeakTags = (cfData?.weak_areas || [])
          .concat(lcData?.weak_areas || [])
          .filter((tag) => {
            if (seenWeak.has(tag)) return false;
            seenWeak.add(tag);
            return true;
          });
        const weak = allWeakTags.slice(0, 3).map((tag) => {
          const tp = profile.find((p) => p.tag === tag);
          return { tag, acRate: tp ? tp.acRate : 0, solved: tp ? tp.solved : 0, attempts: tp ? tp.attempts : 0 };
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
              .catch((e) => { console.warn("Combined POST recs failed, falling back:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; })
          : await getRecommendations(recsHandle, "cf,lc", 12, controller?.signal, weakTopicList)
              .catch((e) => { console.warn("Combined GET recs failed, falling back:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
        if (controller?.signal.aborted) return;

        setLoadingStep(4);
        const recommendations = recsData.recommendations || [];

        setUser(userInfo);
        setCfUser(cfUserInfo);
        setLcUser(lcUserInfo);
        setTagProfile(profile);
        setWeakTags(weak);
        setSuggestedTopics([]);

        // Build combined solved set from both CF and LC backend data
        const combinedSolved = new Set();
        for (const platformData of [cfData, lcData]) {
          for (const t of platformData?.topic_profile || []) {
            if (t.solved_problems) {
              for (const pid of t.solved_problems) combinedSolved.add(pid);
            }
          }
        }
        setSolvedSet(combinedSolved);

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
          attempts: t.attempts,
          solved: t.solved,
          acRate: Math.round(t.solve_rate * 100),
        }));
        const weak = (data.weak_areas || []).map((tag) => {
          const tp = profile.find((p) => p.tag === tag);
          return { tag, acRate: tp ? tp.acRate : 0, solved: tp ? tp.solved : 0, attempts: tp ? tp.attempts : 0 };
        });

        setLoadingStep(2);
        const weakTopicList = weak.map(w => w.tag).join(",");
        masteryScoresRef.current = data.mastery_scores || {};

        let recsData;
        if (Object.keys(masteryScoresRef.current).length > 0) {
          recsData = await getRecommendationsWithMastery(handle.trim(), "lc", 12, controller?.signal, weakTopicList, masteryScoresRef.current)
            .catch((e) => { console.warn("LC POST recs failed, falling back:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
        } else {
          recsData = await getRecommendations(handle.trim(), "lc", 12, controller?.signal, weakTopicList)
            .catch((e) => { console.warn("LC GET recs failed, falling back:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
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
        setSuggestedTopics([]);

        // Build solved set from backend profile data
        const lcSolved = new Set();
        for (const t of data.topic_profile || []) {
          if (t.solved_problems) {
            for (const pid of t.solved_problems) lcSolved.add(pid);
          }
        }
        setSolvedSet(lcSolved);

        analysisRecommendationsRef.current = recsData.recommendations || [];
        analysisSelectedTopicsRef.current = weak.length > 0 ? [weak[0].tag] : [];
        analysisActiveWeakTagRef.current = weak.length > 0 ? weak[0].tag : null;
      } else {
        // Codeforces path: backend first when available, client-only fallback
        let userInfo, profile, weak, solved, recommendations;

        if (useBackend) {
          // Backend path: single API call, no duplicate client-side fetches
          setLoadingStep(1);
          const data = await analyzeHandle(handle.trim(), "cf", analysisMode, controller?.signal).catch(e => {
            console.warn("CF backend analysis failed, falling back to client:", e);
            setError(`Backend failed, falling back: ${e.message || String(e)}`);
            return null;
          });
          if (controller?.signal.aborted) return;

          if (data) {
            userInfo = {
              handle: data.handle,
              platform: data.platform || "cf",
              rating: data.rating,
              rank: data.rank,
              maxRating: data.maxRating,
              maxRank: data.maxRank,
              avatar: data.avatar,
              country: data.country,
              organization: data.organization,
            };
            profile = (data.topic_profile || []).map((t) => ({
              tag: t.topic,
              attempts: t.attempts,
              solved: t.solved,
              acRate: Math.round(t.solve_rate * 100),
            }));
            weak = (data.weak_areas || []).slice(0, 3).map((tag) => {
              const tp = profile.find((p) => p.tag === tag);
              return { tag, acRate: tp ? tp.acRate : 0, solved: tp ? tp.solved : 0, attempts: tp ? tp.attempts : 0 };
            });
            masteryScoresRef.current = data.mastery_scores || {};
            // Build solved set from backend normalize profile
            solved = new Set();
            for (const t of data.topic_profile || []) {
              if (t.solved_problems) {
                for (const pid of t.solved_problems) solved.add(pid);
              }
            }

            setLoadingStep(2);
            setLoadingStep(3);
            setLoadingStep(4);
          }
        }

        if (!useBackend || !userInfo) {
          // Client-only path (or backend failed — use fallback)
          setLoadingStep(1);
          userInfo = await fetchUserInfo(handle.trim(), controller?.signal);
          if (controller?.signal.aborted) return;

          setLoadingStep(2);
          const submissions = await fetchSubmissions(handle.trim(), analysisMode, controller?.signal);
          if (controller?.signal.aborted) return;

          setLoadingStep(3);
          const tagResult = buildTagProfile(submissions);
          profile = tagResult.profile;
          solved = tagResult.solvedSet;
          weak = findWeakTags(profile);

          if (controller?.signal.aborted) return;

          // Client-side mastery approximation
          const scores = {};
          for (const t of profile) {
            scores[t.tag] = t.acRate / 100;
          }
          masteryScoresRef.current = scores;
        }

        if (weak.length > 0) {
          setLoadingStep(4);

          // Get recommendations from backend if available and has mastery scores
          if (useBackend && Object.keys(masteryScoresRef.current).length > 0) {
            const weakTopicList = weak[0].tag;
            const recsData = await getRecommendationsWithMastery(
              handle.trim(), "cf", 12, controller?.signal, weakTopicList, masteryScoresRef.current
            ).catch((e) => { console.warn("CF POST recs failed, falling back:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
            if (controller?.signal.aborted) return;
            recommendations = recsData.recommendations || [];
          } else {
            // Client-side fallback
            const problems = await fetchProblemsForTags([weak[0].tag], controller?.signal);
            if (controller?.signal.aborted) return;
            recommendations = buildRecommendations(problems, solved, userInfo.rating || 800);
          }

          setUser(userInfo);
          setCfUser(null);
          setLcUser(null);
          setTagProfile(profile);
          setWeakTags(weak);
          setSolvedSet(solved || new Set());
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
          setSolvedSet(solved || new Set());
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