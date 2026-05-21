import { AnimatePresence } from "framer-motion";
import useAnalysis from "./hooks/useAnalysis.js";
import useRecommendations from "./hooks/useRecommendations.js";

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
    analysisModelUsedRef: analysis.modelUsedRef,
    platform: analysis.platform,
    combinedPlatform: analysis.combinedPlatform,
  });

  const {
    selectedTopics, fetchingRecs, recs: recommendations,
    activeWeakTag, selectWeakTag,
    toggleTopic, fetchForSelectedTopics, modelUsed,
  } = recs;

  const {
    handle, setHandle,
    cfHandle, setCfHandle,
    lcHandle, setLcHandle,
    loading, loadingStep, error,
    user, cfUser, lcUser, tagProfile, weakTags,
    suggestedTopics, analysisMode, setAnalysisMode,
    platform, setPlatform,
    combinedPlatform, setCombinedPlatform,
    analyze, clearAll,
  } = analysis;

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-base)", color: "var(--on-surface)", overflowX: "hidden", width: "100%" }}>
      <Header onHome={clearAll} />

      {user && (
        <SearchBar
          handle={handle}
          setHandle={setHandle}
          cfHandle={cfHandle}
          setCfHandle={setCfHandle}
          lcHandle={lcHandle}
          setLcHandle={setLcHandle}
          onAnalyze={analyze}
          loading={loading}
          hasResult={!!user}
          onClear={clearAll}
          analysisMode={analysisMode}
          setAnalysisMode={setAnalysisMode}
          platform={platform}
          setPlatform={setPlatform}
          combinedPlatform={combinedPlatform}
          setCombinedPlatform={setCombinedPlatform}
        />
      )}

      {(loading || fetchingRecs) && (
        <LoadingState step={loadingStep} mode={analysisMode} isFetchingRecs={fetchingRecs} platform={combinedPlatform ? "combined" : platform} />
      )}

      {error && <ErrorState message={error} />}

      {!user && !loading && !error && (
        <LandingPage
          handle={handle}
          setHandle={setHandle}
          cfHandle={cfHandle}
          setCfHandle={setCfHandle}
          lcHandle={lcHandle}
          setLcHandle={setLcHandle}
          onAnalyze={analyze}
          loading={loading}
          onClear={clearAll}
          analysisMode={analysisMode}
          setAnalysisMode={setAnalysisMode}
          platform={platform}
          setPlatform={setPlatform}
          combinedPlatform={combinedPlatform}
          setCombinedPlatform={setCombinedPlatform}
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

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {tagProfile.length > 0 && <SkillChart tags={tagProfile} />}

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
                  modelUsed={modelUsed}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}