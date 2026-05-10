import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  fetchUserInfo,
  fetchSubmissions,
  fetchProblemsForTags,
  buildTagProfile,
  findWeakTags,
  buildRecommendations,
  findNextTopics,
} from "./api.js";

import Header from "./components/Header.jsx";
import SearchBar from "./components/SearchBar.jsx";
import ProfileCard from "./components/ProfileCard.jsx";
import WeakAreas from "./components/WeakAreas.jsx";
import TagOverview from "./components/TagOverview.jsx";
import SkillChart from "./components/SkillChart.jsx";
import TopicPicker from "./components/TopicPicker.jsx";
import Recommendations from "./components/Recommendations.jsx";
import LandingPage from "./components/LandingPage.jsx";
import LoadingState from "./components/LoadingState.jsx";
import ErrorState from "./components/ErrorState.jsx";
import SuccessBanner from "./components/SuccessBanner.jsx";

export default function App() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  const [user, setUser] = useState(null);
  const [tagProfile, setTagProfile] = useState([]);
  const [weakTags, setWeakTags] = useState([]);
  const [solvedSet, setSolvedSet] = useState(new Set());

  const [suggestedTopics, setSuggestedTopics] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [fetchingRecs, setFetchingRecs] = useState(false);

  const [recs, setRecs] = useState([]);
  const [activeWeakTag, setActiveWeakTag] = useState(null);
  const [analysisMode, setAnalysisMode] = useState("quick");

  const analyze = async () => {
    if (!handle.trim() || loading) return;

    setLoading(true);
    setError("");
    setUser(null);
    setTagProfile([]);
    setWeakTags([]);
    setSolvedSet(new Set());
    setSuggestedTopics([]);
    setSelectedTopics([]);
    setRecs([]);
    setActiveWeakTag(null);

    try {
      setLoadingStep(1);
      const userInfo = await fetchUserInfo(handle.trim());

      setLoadingStep(2);
      const submissions = await fetchSubmissions(handle.trim(), analysisMode);

      setLoadingStep(3);
      const { profile, solvedSet: solved } = buildTagProfile(submissions);
      const weak = findWeakTags(profile);

      let recommendations = [];
      let selectedTag = null;
      let suggested = [];

      if (weak.length > 0) {
        setLoadingStep(4);
        selectedTag = weak[0].tag;
        const problems = await fetchProblemsForTags([selectedTag]);
        recommendations = buildRecommendations(problems, solved, userInfo.rating || 1200);
      } else {
        suggested = findNextTopics(profile, userInfo.rating || 1200, 5);
      }

      setUser(userInfo);
      setTagProfile(profile);
      setWeakTags(weak);
      setSolvedSet(solved);
      if (selectedTag) {
        setActiveWeakTag(selectedTag);
        setRecs(recommendations);
        setSelectedTopics([selectedTag]);
      } else {
        setSuggestedTopics(suggested);
      }
    } catch (err) {
      setError(err.message || "Failed to analyze handle. Please verify the username.");
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  };

  const selectWeakTag = async (tag) => {
    setActiveWeakTag(tag);
    setFetchingRecs(true);
    setRecs([]);
    try {
      const problems = await fetchProblemsForTags([tag]);
      const recommendations = buildRecommendations(problems, solvedSet, user.rating || 1200);
      setRecs(recommendations);
      setSelectedTopics([tag]);
    } catch { setError("Failed to fetch problems."); }
    finally { setFetchingRecs(false); }
  };

  const clearResults = () => {
    setUser(null);
    setTagProfile([]);
    setWeakTags([]);
    setSolvedSet(new Set());
    setSuggestedTopics([]);
    setSelectedTopics([]);
    setRecs([]);
    setError("");
    setActiveWeakTag(null);
    setHandle("");
  };

  const toggleTopic = (tag) => {
    setSelectedTopics((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const fetchForSelectedTopics = async () => {
    if (!selectedTopics.length || fetchingRecs) return;

    setFetchingRecs(true);
    setRecs([]);
    try {
      const problems = await fetchProblemsForTags(selectedTopics);
      const recommendations = buildRecommendations(problems, solvedSet, user.rating || 1200);
      setRecs(recommendations);
    } catch {
      setError("Synchronization error. Please try again.");
    } finally {
      setFetchingRecs(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-base)", color: "var(--on-surface)", overflowX: "hidden", width: "100%" }}>
      <Header onHome={clearResults} />

      {user && (
        <SearchBar
          handle={handle}
          setHandle={setHandle}
          onAnalyze={analyze}
          loading={loading}
          hasResult={!!user}
          onClear={clearResults}
          analysisMode={analysisMode}
          setAnalysisMode={setAnalysisMode}
        />
      )}

      {(loading || fetchingRecs) && (
        <LoadingState step={loadingStep} mode={analysisMode} isFetchingRecs={fetchingRecs} />
      )}

      {error && <ErrorState message={error} />}

      {!user && !loading && !error && (
        <LandingPage
          handle={handle}
          setHandle={setHandle}
          onAnalyze={analyze}
          loading={loading}
          onClear={clearResults}
          analysisMode={analysisMode}
          setAnalysisMode={setAnalysisMode}
        />
      )}

      {user && (
        <div
          className="fade-in dashboard-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "300px 1fr",
            gap: 24,
            padding: "32px 48px 80px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <ProfileCard user={user} tagCount={tagProfile.length} weakCount={weakTags.length} />
            <WeakAreas weakTags={weakTags} selectedTag={activeWeakTag} onSelectTag={selectWeakTag} />
            <TagOverview tags={tagProfile} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {tagProfile.length > 0 && <SkillChart tags={tagProfile} />}

            {weakTags.length === 0 && tagProfile.length > 0 && tagProfile.every(t => t.solved >= 10) && <SuccessBanner />}

            {suggestedTopics.length > 0 && weakTags.length === 0 && (
              <TopicPicker
                topics={suggestedTopics}
                selected={selectedTopics}
                onToggle={toggleTopic}
                onConfirm={fetchForSelectedTopics}
                loading={fetchingRecs}
              />
            )}

            <AnimatePresence>
              {recs.length > 0 && (
                <Recommendations
                  recs={recs}
                  userRating={user.rating || 1200}
                  selectedTopics={selectedTopics}
                  solvedSet={solvedSet}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
