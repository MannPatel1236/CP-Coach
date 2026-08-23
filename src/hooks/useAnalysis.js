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

// Analysis snapshot persistence: a refresh restores the dashboard instead of the
// landing page. Best-effort — storage-full/private-mode failures are swallowed.
const SNAPSHOT_KEY = "cpcoach.analysis";
let cachedSnapshot = null;
const getSnapshot = () => {
  if (cachedSnapshot) return cachedSnapshot;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    cachedSnapshot = JSON.parse(raw);
    return cachedSnapshot && cachedSnapshot.user ? cachedSnapshot : null;
  } catch {
    return null;
  }
};

export default function useAnalysis() {
  const snap = getSnapshot();
  const [handle, setHandle] = useState(() => snap?.handle || "");
  const [cfHandle, setCfHandle] = useState(() => snap?.cfHandle || "");
  const [lcHandle, setLcHandle] = useState(() => snap?.lcHandle || "");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [modelUsed, setModelUsed] = useState(() => snap?.modelUsed || null);  // §8: mastery provenance ("graph_dkt" | "rule_based" | "stats_only" | null)

  const [user, setUser] = useState(() => snap?.user || null);
  const [cfUser, setCfUser] = useState(() => snap?.cfUser || null);
  const [lcUser, setLcUser] = useState(() => snap?.lcUser || null);
  const [tagProfile, setTagProfile] = useState(() => snap?.tagProfile || []);
  const [weakTags, setWeakTags] = useState(() => snap?.weakTags || []);
  const [solvedSet, setSolvedSet] = useState(() => new Set(snap?.solvedSet || []));

  const [suggestedTopics, setSuggestedTopics] = useState(() => snap?.suggestedTopics || []);
  const [analysisMode, setAnalysisMode] = useState(() => snap?.analysisMode || "quick");
  const [platform, setPlatform] = useState(() => snap?.platform || "cf");
  const [combinedPlatform, setCombinedPlatform] = useState(() => snap?.combinedPlatform || false);

  const abortRef = useRef(null);

  // Refs to pass initial recommendations from analyze() to useRecommendations
  const analysisRecommendationsRef = useRef(snap?.analysisRecommendations || []);
  const analysisSelectedTopicsRef = useRef(snap?.analysisSelectedTopics || []);
  const analysisActiveWeakTagRef = useRef(snap?.analysisActiveWeakTag || null);
  const masteryScoresRef = useRef(snap?.masteryScores || {});

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

  // Persist the resolved analysis so a refresh restores the dashboard + hash tab.
  useEffect(() => {
    if (!user) return;
    // Identity guard: while the search box holds a query matching none of the
    // analyzed handles (a new search typed over a displayed analysis), skip the
    // write so the snapshot never pairs one handle's profile with another's name.
    const q = handle.trim().toLowerCase();
    const analyzedIds = [cfHandle, lcHandle, ...(user.handle || "").split(" / ")]
      .map((h) => (h || "").trim().toLowerCase()).filter(Boolean);
    if (q && analyzedIds.length > 0 && !analyzedIds.includes(q)) return;
    const snapshot = {
      handle, cfHandle, lcHandle,
      user, cfUser, lcUser,
      tagProfile, weakTags, suggestedTopics,
      solvedSet: [...solvedSet],
      analysisMode, platform, combinedPlatform, modelUsed,
      masteryScores: masteryScoresRef.current,
      analysisRecommendations: analysisRecommendationsRef.current,
      analysisSelectedTopics: analysisSelectedTopicsRef.current,
      analysisActiveWeakTag: analysisActiveWeakTagRef.current,
    };
    try {
      window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
      // persistence is best-effort
    }
  }, [user, handle, cfHandle, lcHandle, cfUser, lcUser, tagProfile, weakTags, suggestedTopics, solvedSet, analysisMode, platform, combinedPlatform, modelUsed]);

  const clearAll = useCallback(() => {
    resetAbort();
    try {
      window.localStorage.removeItem(SNAPSHOT_KEY);
    } catch {
      // ignore
    }
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
    setModelUsed(null);
  }, [resetAbort]);

  // ── Combined CF + LC analysis ────────────────────────────────────────
  async function analyzeCombined(controller) {
    setLoadingStep(1);

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

    const platformErrors = [];
    if (cfData?._error) platformErrors.push(cfData._error);
    if (lcData?._error) platformErrors.push(lcData._error);
    if (platformErrors.length === 2) {
      throw new Error("Analysis failed for both platforms. Please verify the usernames and try again.");
    }
    if (platformErrors.length === 1) {
      const failed = cfData?._error ? "Codeforces" : "LeetCode";
      const hasOtherHandle = cfData?._error ? lcHandle?.trim() : cfHandle?.trim();
      if (!hasOtherHandle) {
        throw new Error(`${failed} analysis failed: ${platformErrors[0]}. Please check the username and try again.`);
      }
      const success = cfData?._error ? "LeetCode" : "Codeforces";
      setError(`${failed} analysis failed: ${platformErrors[0]}. Showing ${success} data only.`);
    }

    // Merge CF and LC topic profiles
    const cfProfile = cfData?.topic_profile || [];
    const lcProfile = lcData?.topic_profile || [];
    const mergedProfile = {};

    const addTopics = (arr, source) => {
      for (const t of arr) {
        if (!mergedProfile[t.topic]) {
          mergedProfile[t.topic] = { topic: t.topic, solved: 0, cf_attempts: 0, lc_attempts: 0 };
        }
        if (source === "cf") {
          mergedProfile[t.topic].cf_attempts += t.attempts;
        } else {
          mergedProfile[t.topic].lc_attempts += t.attempts;
        }
        if (!mergedProfile[t.topic].solvedSet) {
          mergedProfile[t.topic].solvedSet = new Set();
        }
        for (const pid of t.solved_problems || []) {
          mergedProfile[t.topic].solvedSet.add(pid);
        }
      }
    };
    addTopics(cfProfile, "cf");
    addTopics(lcProfile, "lc");

    for (const topic of Object.values(mergedProfile)) {
      const attempts = topic.cf_attempts + topic.lc_attempts;
      topic.attempts = attempts;
      topic.solved = topic.solvedSet.size;
      topic.solve_rate = attempts > 0 ? topic.solved / attempts : 0;
      topic.platform_breakdown = { cf: topic.cf_attempts, lc: topic.lc_attempts };
    }

    const profile = Object.values(mergedProfile).map((t) => ({
      tag: t.topic,
      attempts: t.attempts,
      solved: t.solved,
      acRate: Math.round(t.solve_rate * 100),
    }));

    // Deduplicate weak areas
    const seenWeak = new Set();
    const allWeakTags = (cfData?.weak_areas || [])
      .concat(lcData?.weak_areas || [])
      .filter((tag) => { if (seenWeak.has(tag)) return false; seenWeak.add(tag); return true; });
    const weak = allWeakTags.slice(0, 3).map((tag) => {
      const tp = profile.find((p) => p.tag === tag);
      return { tag, acRate: tp ? tp.acRate : 0, solved: tp ? tp.solved : 0, attempts: tp ? tp.attempts : 0 };
    });

    const userInfo = {
      handle: cfHandle && lcHandle ? `${cfHandle.trim()} / ${lcHandle.trim()}` : (cfHandle?.trim() || lcHandle?.trim() || ""),
      platform: "combined",
    };

    const cfUserInfo = cfHandle?.trim() ? {
      handle: cfHandle.trim(), platform: "cf",
      rating: cfData?.rating || null, maxRating: cfData?.maxRating ?? cfData?.rating ?? null,
      rank: cfData?.rank || null, maxRank: cfData?.maxRank || null,
      avatar: cfData?.avatar || cfData?.titlePhoto || null,
      country: cfData?.country || null, organization: cfData?.organization || null,
    } : null;

    const lcUserInfo = lcHandle?.trim() ? {
      handle: lcHandle.trim(), platform: "lc",
      rating: lcData?.rating || null, maxRating: lcData?.maxRating ?? lcData?.rating ?? null,
      easy_solved: lcData?.easy_solved || 0, medium_solved: lcData?.medium_solved || 0, hard_solved: lcData?.hard_solved || 0,
    } : null;

    const mergedMastery = { ...cfData?.mastery_scores, ...lcData?.mastery_scores };
    masteryScoresRef.current = mergedMastery;
    const presentModels = [cfData?.model_used, lcData?.model_used].filter(Boolean);
    const allAgree = presentModels.length > 0 && presentModels.every(m => m === presentModels[0]);
    setModelUsed(allAgree ? presentModels[0] : "rule_based");

    setLoadingStep(3);
    const recsHandle = cfHandle?.trim() || lcHandle?.trim() || "";
    const weakTopicList = weak.map(w => w.tag).join(",");
    const recsData = Object.keys(mergedMastery).length > 0
      ? await getRecommendationsWithMastery(recsHandle, "cf,lc", 12, controller?.signal, weakTopicList, mergedMastery, [], null, cfHandle?.trim() || null, lcHandle?.trim() || null)
          .catch((e) => { console.warn("Combined POST recs failed:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; })
      : await getRecommendations(recsHandle, "cf,lc", 12, controller?.signal, weakTopicList)
          .catch((e) => { console.warn("Combined GET recs failed:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
    if (controller?.signal.aborted) return;

    setLoadingStep(4);
    const recommendations = recsData.recommendations || [];

    setUser(userInfo);
    setCfUser(cfUserInfo);
    setLcUser(lcUserInfo);
    setTagProfile(profile);
    setWeakTags(weak);
    setSuggestedTopics([]);

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
  }

  // ── LeetCode-only analysis ───────────────────────────────────────────
  async function analyzeLC(controller) {
    setLoadingStep(1);
    const data = await analyzeHandle(handle.trim(), "lc", analysisMode, controller?.signal);
    if (controller?.signal.aborted) return;

    const profile = (data.topic_profile || []).map((t) => ({
      tag: t.topic, attempts: t.attempts, solved: t.solved, acRate: Math.round(t.solve_rate * 100),
    }));
    const weak = (data.weak_areas || []).map((tag) => {
      const tp = profile.find((p) => p.tag === tag);
      return { tag, acRate: tp ? tp.acRate : 0, solved: tp ? tp.solved : 0, attempts: tp ? tp.attempts : 0 };
    });

    setLoadingStep(2);
    setTimeout(() => setLoadingStep(3), 0);
    setTimeout(() => setLoadingStep(4), 0);
    const weakTopicList = weak.map(w => w.tag).join(",");
    masteryScoresRef.current = data.mastery_scores || {};
    setModelUsed(data.model_used || "rule_based");

    let recsData;
    if (Object.keys(masteryScoresRef.current).length > 0) {
      recsData = await getRecommendationsWithMastery(handle.trim(), "lc", 12, controller?.signal, weakTopicList, masteryScoresRef.current)
        .catch((e) => { console.warn("LC POST recs failed:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
    } else {
      recsData = await getRecommendations(handle.trim(), "lc", 12, controller?.signal, weakTopicList)
        .catch((e) => { console.warn("LC GET recs failed:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
    }
    if (controller?.signal.aborted) return;

    const userInfo = {
      handle: data.handle, rating: data.rating, platform: data.platform,
      easy_solved: data.easy_solved, medium_solved: data.medium_solved, hard_solved: data.hard_solved,
    };

    setUser(userInfo);
    setCfUser(null);
    setLcUser(userInfo);
    setTagProfile(profile);
    setWeakTags(weak);
    setSuggestedTopics([]);

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
  }

  // ── Codeforces-only analysis ─────────────────────────────────────────
  async function analyzeCF(controller) {
    let userInfo, profile, weak, solved, recommendations;
    const useBackend = import.meta.env.VITE_API_URL;

    if (useBackend) {
      setLoadingStep(1);
      const data = await analyzeHandle(handle.trim(), "cf", analysisMode, controller?.signal).catch(e => {
        console.warn("CF backend analysis failed, falling back to client:", e);
        setError(`Backend failed, falling back: ${e.message || String(e)}`);
        return null;
      });
      if (controller?.signal.aborted) return;

      if (data) {
        userInfo = {
          handle: data.handle, platform: data.platform || "cf",
          rating: data.rating, rank: data.rank, maxRating: data.maxRating,
          maxRank: data.maxRank, avatar: data.avatar, country: data.country, organization: data.organization,
        };
        profile = (data.topic_profile || []).map((t) => ({
          tag: t.topic, attempts: t.attempts, solved: t.solved, acRate: Math.round(t.solve_rate * 100),
        }));
        weak = (data.weak_areas || []).slice(0, 3).map((tag) => {
          const tp = profile.find((p) => p.tag === tag);
          return { tag, acRate: tp ? tp.acRate : 0, solved: tp ? tp.solved : 0, attempts: tp ? tp.attempts : 0 };
        });
        masteryScoresRef.current = data.mastery_scores || {};
        setModelUsed(data.model_used || "rule_based");
        solved = new Set();
        for (const t of data.topic_profile || []) {
          if (t.solved_problems) {
            for (const pid of t.solved_problems) solved.add(pid);
          }
        }

        setLoadingStep(2);
        setTimeout(() => setLoadingStep(3), 0);
        setTimeout(() => setLoadingStep(4), 0);
      }
    }

    if (!useBackend || !userInfo) {
      setLoadingStep(1);
      userInfo = await fetchUserInfo(handle.trim(), controller?.signal);
      if (controller?.signal.aborted) return;

      setLoadingStep(2);
      const submissions = await fetchSubmissions(handle.trim(), analysisMode, controller?.signal);
      if (controller?.signal.aborted) return;

      setTimeout(() => setLoadingStep(3), 0);
      setTimeout(() => setLoadingStep(4), 0);
      const tagResult = buildTagProfile(submissions);
      profile = tagResult.profile;
      solved = tagResult.solvedSet;
      weak = findWeakTags(profile);

      if (controller?.signal.aborted) return;

      const scores = {};
      for (const t of profile) {
        scores[t.tag] = t.acRate / 100;
      }
      masteryScoresRef.current = scores;
      setModelUsed("rule_based");  // §8: client fallback mastery (acRate/100) is a linear heuristic → badge as estimate
    }

    if (weak.length > 0) {
      setLoadingStep(4);

      if (useBackend && Object.keys(masteryScoresRef.current).length > 0) {
        const weakTopicList = weak[0].tag;
        const recsData = await getRecommendationsWithMastery(
          handle.trim(), "cf", 12, controller?.signal, weakTopicList, masteryScoresRef.current
        ).catch((e) => { console.warn("CF POST recs failed:", e); setError(`Recommendations failed: ${e.message || String(e)}`); return { recommendations: [], model_used: "rule_based" }; });
        if (controller?.signal.aborted) return;
        recommendations = recsData.recommendations || [];
      } else {
        const problems = await fetchProblemsForTags([weak[0].tag], controller?.signal);
        if (controller?.signal.aborted) return;
        recommendations = buildRecommendations(problems, solved, userInfo.rating || 800);
      }

      setUser(userInfo);
      // CF-only path still populates cfUser/cfHandle so Phase-4 sections keyed on
      // them (RatingTrajectory gate, heatmap/mastery platform pick) stay live.
      setCfUser(userInfo);
      setCfHandle(handle.trim());
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
      setCfUser(userInfo);
      setCfHandle(handle.trim());
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

  // Helpers (analyzeCombined / analyzeLC / analyzeCF) are plain async functions,
  // not wrapped in useCallback, to always read fresh abort controller signals.
  const analyze = useCallback(async () => {
    const effectiveHandle = combinedPlatform ? (cfHandle || lcHandle) : handle;
    if (!effectiveHandle?.trim() || loading) return;

    resetAbort();
    const controller = abortRef.current;

    setLoading(true);
    setError("");
    setModelUsed(null);
    // A re-analysis invalidates the stored snapshot immediately: if this run
    // fails, a refresh must land on the landing page — not resurrect the
    // previous handle's dashboard under the newly typed query.
    try { window.localStorage.removeItem(SNAPSHOT_KEY); } catch { /* ignore */ }
    setUser(null);
    setTagProfile([]);
    setWeakTags([]);
    setSolvedSet(new Set());
    setSuggestedTopics([]);

    try {
      const useBackend = import.meta.env.VITE_API_URL;
      const isLC = platform === "lc";
      const isCombined = combinedPlatform;

      if (!useBackend && (isLC || isCombined)) {
        throw new Error(
          "LeetCode analysis requires the backend service. Please set VITE_API_URL or switch to Codeforces."
        );
      }

      if (useBackend && isCombined) {
        await analyzeCombined(controller);
      } else if (useBackend && isLC) {
        await analyzeLC(controller);
      } else {
        await analyzeCF(controller);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to analyze handle. Please verify the username.");
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
    // analyzeCombined / analyzeLC / analyzeCF are plain fns (not useCallback) so they can
    // read fresh abort controller signals on each call — intentionally missing from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, cfHandle, lcHandle, loading, analysisMode, platform, combinedPlatform, resetAbort]);

  return {
    // State
    handle, setHandle,
    cfHandle, setCfHandle,
    lcHandle, setLcHandle,
    loading, loadingStep,
    error,
    modelUsed,
    user, cfUser, lcUser,
    tagProfile, weakTags,
    solvedSet, suggestedTopics,
    analysisMode, setAnalysisMode,
    platform, setPlatform,
    combinedPlatform, setCombinedPlatform,
    // Actions
    analyze, clearAll,
    // Shared
    abortRef, resetAbort,
    analysisRecommendationsRef, analysisSelectedTopicsRef, analysisActiveWeakTagRef, masteryScoresRef,
  };
}
