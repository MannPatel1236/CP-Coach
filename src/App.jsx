import { AnimatePresence } from "framer-motion";
import useAnalysis from "./hooks/useAnalysis.js";
import useRecommendations from "./hooks/useRecommendations.js";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts.js";
import { AnalysisContext } from "./hooks/AnalysisContext.jsx";

import Header from "./components/Header.jsx";
import SearchBar from "./components/SearchBar.jsx";
import ProfileCard from "./components/ProfileCard.jsx";
import WeakAreas from "./components/WeakAreas.jsx";
import TagOverview from "./components/TagOverview.jsx";
import SkillChart from "./components/SkillChart.jsx";
import TopicPicker from "./components/TopicPicker.jsx";
import Recommendations from "./components/Recommendations.jsx";
import TopicGraphViz from "./components/TopicGraphViz.jsx";
import ModelInsight from "./components/ModelInsight.jsx";
import LandingPage from "./components/LandingPage.jsx";
import LoadingState from "./components/LoadingState.jsx";
import ErrorState from "./components/ErrorState.jsx";
import SuccessBanner from "./components/SuccessBanner.jsx";
import PrivacyPolicy from "./components/PrivacyPolicy.jsx";

export default function App() {
  const analysis = useAnalysis();

  const recs = useRecommendations({
    solvedSet: analysis.solvedSet,
    user: analysis.user,
    abortRef: analysis.abortRef,
    resetAbort: analysis.resetAbort,
    analysisRecommendationsRef: analysis.analysisRecommendationsRef,
    analysisSelectedTopicsRef: analysis.analysisSelectedTopicsRef,
    analysisActiveWeakTagRef: analysis.analysisActiveWeakTagRef,
    analysisMasteryScoresRef: analysis.masteryScoresRef,
    platform: analysis.platform,
    combinedPlatform: analysis.combinedPlatform,
  });

  const {
    selectedTopics, fetchingRecs, recs: recommendations,
    activeWeakTag, selectWeakTag,
    toggleTopic, fetchForSelectedTopics, error: recError,
  } = recs;

  const {
    handle, setHandle,
    cfHandle, setCfHandle,
    lcHandle, setLcHandle,
    loading, loadingStep, error,
    user, cfUser, lcUser, tagProfile, weakTags, solvedSet,
    suggestedTopics, analysisMode, setAnalysisMode,
    platform, setPlatform,
    combinedPlatform, setCombinedPlatform,
    analyze, clearAll,
  } = analysis;

  const focusSearch = () => {
    const input = document.querySelector(".search-input");
    if (input) input.focus();
  };

  const handlePlatformToggle = (key) => {
    if (key === "1") setPlatform("cf");
    if (key === "2") setPlatform("lc");
    if (key === "3") setCombinedPlatform(!combinedPlatform);
  };

  useKeyboardShortcuts({
    onFocusSearch: focusSearch,
    onClear: clearAll,
    onPlatformToggle: handlePlatformToggle,
    disabled: !user,
  });

  return (
    <AnalysisContext.Provider value={{
      handle, setHandle, cfHandle, setCfHandle, lcHandle, setLcHandle,
      loading, loadingStep, error,
      user, cfUser, lcUser, tagProfile, weakTags, solvedSet, suggestedTopics,
      analysisMode, setAnalysisMode, platform, setPlatform,
      combinedPlatform, setCombinedPlatform, analyze, clearAll,
      selectedTopics, fetchingRecs, recommendations,
      activeWeakTag, selectWeakTag, toggleTopic, fetchForSelectedTopics, recError,
    }}>
    <div style={{ minHeight: "100vh", background: "var(--surface-base)", color: "var(--on-surface)", overflowX: "hidden", width: "100%" }}>
      <a
        href="#main-content"
        style={{
          position: "absolute",
          top: -40,
          left: 0,
          zIndex: 100,
          padding: 8,
          background: "var(--primary-container, #6366f1)",
          color: "#fff",
          textDecoration: "none",
          borderRadius: "0 0 4px 0",
          transition: "top 0.2s",
        }}
        onFocus={(e) => { e.currentTarget.style.top = 0; }}
        onBlur={(e) => { e.currentTarget.style.top = -40; }}
      >
        Skip to content
      </a>
      <Header onHome={clearAll} />

      {user && (
        <SearchBar />
      )}

      {(loading || fetchingRecs) && (
        <LoadingState step={loadingStep} mode={analysisMode} isFetchingRecs={fetchingRecs} platform={combinedPlatform ? "combined" : platform} />
      )}

      {(error || recError) && <ErrorState message={error || recError} />}

      {!user && !loading && !error && (
        <LandingPage />
      )}

      {user && (
        <main
          id="main-content"
          className="fade-in dashboard-grid dashboard-layout"
        >
          <div className="column-panel" style={{ minWidth: 0 }}>
            {combinedPlatform && cfUser && lcUser ? (
              <>
                <ProfileCard user={cfUser} tagCount={tagProfile.length} weakCount={weakTags.length} />
                <ProfileCard user={lcUser} tagCount={tagProfile.length} weakCount={weakTags.length} />
              </>
            ) : combinedPlatform && cfUser ? (
              <ProfileCard user={cfUser} tagCount={tagProfile.length} weakCount={weakTags.length} />
            ) : combinedPlatform && lcUser ? (
              <ProfileCard user={lcUser} tagCount={tagProfile.length} weakCount={weakTags.length} />
            ) : (
              <ProfileCard user={user} tagCount={tagProfile.length} weakCount={weakTags.length} />
            )}
            <WeakAreas weakTags={weakTags} selectedTag={activeWeakTag} onSelectTag={selectWeakTag} />
            <TagOverview tags={tagProfile} />
          </div>

          <div className="column-panel" style={{ minWidth: 0 }}>
            {tagProfile.length > 0 && <SkillChart tags={tagProfile} />}
            {user && <TopicGraphViz weakTags={weakTags} />}

            {tagProfile.length > 0 && weakTags.length === 0 && <SuccessBanner />}

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
              {recommendations.length > 0 && (
                <Recommendations
                  recs={recommendations}
                  userRating={cfUser?.rating || lcUser?.rating || user?.rating || 800}
                  selectedTopics={selectedTopics}
                />
              )}
            </AnimatePresence>

            {tagProfile.length > 0 && (
              <ModelInsight topicProfile={tagProfile} selectedTopics={selectedTopics} />
            )}
          </div>
        </main>
      )}
      <PrivacyPolicy />
    </div>
    </AnalysisContext.Provider>
  );
}
