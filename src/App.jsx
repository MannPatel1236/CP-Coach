import { useMemo, useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import useAnalysis from "./hooks/useAnalysis.js";
import useRecommendations from "./hooks/useRecommendations.js";
import useKeyboardShortcuts from "./hooks/useKeyboardShortcuts.js";
import { AnalysisContext } from "./hooks/AnalysisContext.jsx";

import Header from "./components/Header.jsx";
import SearchBar from "./components/SearchBar.jsx";
import DashboardNav from "./components/DashboardNav.jsx";
import ProfileCard from "./components/ProfileCard.jsx";
import WeakAreas from "./components/WeakAreas.jsx";
import TagOverview from "./components/TagOverview.jsx";
import SkillChart from "./components/SkillChart.jsx";
import TopicPicker from "./components/TopicPicker.jsx";
import Recommendations from "./components/Recommendations.jsx";
import SkillFrontier from "./components/SkillFrontier.jsx";
import RatingTrajectory from "./components/RatingTrajectory.jsx";
import MasteryHistory from "./components/MasteryHistory.jsx";
import ActivityHeatmap from "./components/ActivityHeatmap.jsx";
import CompareHandles from "./components/CompareHandles.jsx";
import Workbook from "./components/Workbook.jsx";
import WhyThisRec from "./components/WhyThisRec.jsx";
import ModelInsight from "./components/ModelInsight.jsx";
import LandingPage from "./components/LandingPage.jsx";
import LoadingState from "./components/LoadingState.jsx";
import ErrorState from "./components/ErrorState.jsx";
import SuccessBanner from "./components/SuccessBanner.jsx";
import PrivacyPolicy from "./components/PrivacyPolicy.jsx";

const DASH_PANEL_IDS = ["practice", "analytics", "compare", "workbook"];

const sanitizeTab = (raw) => {
  const tab = String(raw || "").replace(/^#/, "").toLowerCase().trim();
  return DASH_PANEL_IDS.includes(tab) ? tab : "practice";
};

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
    cfHandle: analysis.cfHandle,
    lcHandle: analysis.lcHandle,
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
    modelUsed, masteryScoresRef,
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

  const [activeTab, setActiveTab] = useState(() => sanitizeTab(window.location.hash));

  const switchTab = useCallback((tab) => {
    const next = sanitizeTab(tab);
    setActiveTab(next);
    window.history.replaceState(null, "", "#" + next);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const onHash = () => setActiveTab(sanitizeTab(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Escape / home reset the analysis AND the view; clearAll itself stays untouched.
  // Going home lands on the landing page, so the URL drops the tab hash entirely
  // (switchTab would write "#practice" onto a page with no dashboard tabs).
  const handleClear = useCallback(() => {
    clearAll();
    setActiveTab("practice");
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
  }, [clearAll]);

  useKeyboardShortcuts({
    onFocusSearch: focusSearch,
    onClear: handleClear,
    onPlatformToggle: handlePlatformToggle,
    disabled: !user,
  });

  const contextValue = useMemo(() => ({
    handle, setHandle, cfHandle, setCfHandle, lcHandle, setLcHandle,
    loading, loadingStep, error,
    modelUsed, masteryScoresRef,
    user, cfUser, lcUser, tagProfile, weakTags, solvedSet, suggestedTopics,
    analysisMode, setAnalysisMode, platform, setPlatform,
    combinedPlatform, setCombinedPlatform, analyze, clearAll,
    selectedTopics, fetchingRecs, recommendations,
    activeWeakTag, selectWeakTag, toggleTopic, fetchForSelectedTopics, recError,
  }), [handle, setHandle, cfHandle, setCfHandle, lcHandle, setLcHandle, loading, loadingStep, error, modelUsed, masteryScoresRef, user, cfUser, lcUser, tagProfile, weakTags, solvedSet, suggestedTopics, analysisMode, setAnalysisMode, platform, setPlatform, combinedPlatform, setCombinedPlatform, analyze, clearAll, selectedTopics, fetchingRecs, recommendations, activeWeakTag, recError, selectWeakTag, toggleTopic, fetchForSelectedTopics]);

  return (
    <AnalysisContext.Provider value={contextValue}>
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
      <Header onHome={handleClear} />

      {user && (
        <SearchBar />
      )}

      {user && (
        <DashboardNav activeTab={activeTab} onSelectTab={switchTab} />
      )}

      {(loading || fetchingRecs) && (
        <LoadingState step={loadingStep} mode={analysisMode} isFetchingRecs={fetchingRecs} platform={combinedPlatform ? "combined" : platform} />
      )}

      {(error || recError) && <ErrorState message={error || recError} />}

      {!user && !loading && !error && (
        <LandingPage />
      )}

      {user && (
        <main id="main-content" className="fade-in">
          <section
            id="panel-practice"
            role="tabpanel"
            aria-labelledby="tab-practice"
            className="dash-panel dashboard-grid dashboard-layout"
            hidden={activeTab !== "practice"}
            inert={activeTab === "practice" ? undefined : ""}
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
              {user && <SkillFrontier />}

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

              {recommendations.length > 0 && (
                <WhyThisRec />
              )}

              {tagProfile.length > 0 && (
                <ModelInsight topicProfile={tagProfile} selectedTopics={selectedTopics} />
              )}
            </div>
          </section>

          <section
            id="panel-analytics"
            role="tabpanel"
            aria-labelledby="tab-analytics"
            className="dash-panel dashboard-single-col"
            hidden={activeTab !== "analytics"}
            inert={activeTab === "analytics" ? undefined : ""}
          >
            {tagProfile.length > 0 && <SkillChart tags={tagProfile} />}

            {cfUser && <RatingTrajectory />}

            <MasteryHistory />

            <ActivityHeatmap />
          </section>

          <section
            id="panel-compare"
            role="tabpanel"
            aria-labelledby="tab-compare"
            className="dash-panel dashboard-single-col"
            hidden={activeTab !== "compare"}
            inert={activeTab === "compare" ? undefined : ""}
          >
            <CompareHandles />
          </section>

          <section
            id="panel-workbook"
            role="tabpanel"
            aria-labelledby="tab-workbook"
            className="dash-panel dashboard-single-col"
            hidden={activeTab !== "workbook"}
            inert={activeTab === "workbook" ? undefined : ""}
          >
            <Workbook />
          </section>
        </main>
      )}
      <PrivacyPolicy />
    </div>
    </AnalysisContext.Provider>
  );
}
