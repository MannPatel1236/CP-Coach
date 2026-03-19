import { useState } from "react";
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
import { CheckIcon, LogoIcon, AlertIcon } from "./components/Icons.jsx";

const STEP_LABELS_QUICK = [
  "",
  "Accessing Codeforces record...",
  "Scanning recent submissions...",
  "Building skill metrics...",
  "Aggregating problems...",
];

const STEP_LABELS_DEEP = [
  "",
  "Accessing Codeforces record...",
  "Scanning full submission history (may take 10–20s)...",
  "Building skill metrics...",
  "Aggregating problems...",
];

export default function App() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  // Profile state
  const [user, setUser] = useState(null);
  const [tagProfile, setTagProfile] = useState([]);
  const [weakTags, setWeakTags] = useState([]);
  const [solvedSet, setSolvedSet] = useState(new Set());

  // Topic picker state (shown when no weak areas)
  const [suggestedTopics, setSuggestedTopics] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [fetchingRecs, setFetchingRecs] = useState(false);

  // Final recommendations
  const [recs, setRecs] = useState([]);

  // Active weak tag selection
  const [activeWeakTag, setActiveWeakTag] = useState(null);
  const [analysisMode, setAnalysisMode] = useState("quick");

  // ── Analyze handle ──────────────────────────────────────────────────────────
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

      setUser(userInfo);
      setTagProfile(profile);
      setWeakTags(weak);
      setSolvedSet(solved);

      if (weak.length > 0) {
        setLoadingStep(4);
        setActiveWeakTag(weak[0].tag);
        const problems = await fetchProblemsForTags([weak[0].tag]);
        const recommendations = buildRecommendations(problems, solved, userInfo.rating || 1200);
        setRecs(recommendations);
        setSelectedTopics([weak[0].tag]);
      } else {
        const suggested = findNextTopics(profile, userInfo.rating || 1200, 5);
        setSuggestedTopics(suggested);
      }
    } catch (err) {
      setError(err.message || "Failed to analyze handle. Please verify the username.");
    } finally {
      setLoading(false);
      setLoadingStep(0);
    }
  };

  // ── Select weak tag ─────────────────────────────────────────────────────────
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

  // ── Clear results ───────────────────────────────────────────────────────────
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

  // ── Toggle topic selection ──────────────────────────────────────────────────
  const toggleTopic = (tag) => {
    setSelectedTopics((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // ── Fetch problems for selected topics ──────────────────────────────────────
  const fetchForSelectedTopics = async () => {
    if (!selectedTopics.length || fetchingRecs) return;

    setFetchingRecs(true);
    setRecs([]);

    try {
      const problems = await fetchProblemsForTags(selectedTopics);
      const recommendations = buildRecommendations(
        problems,
        solvedSet,
        user.rating || 1200
      );
      setRecs(recommendations);
    } catch (err) {
      setError("Synchronization error. Please try again.");
    } finally {
      setFetchingRecs(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-dark)", color: "var(--text-primary)", paddingBottom: 80 }}>
      <Header />

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

      {/* Loading */}
      {(loading || fetchingRecs) && (
        <div style={{ padding: "20px 36px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--accent-primary)", fontSize: 13, fontWeight: 600 }}>
              <div className="pulse" style={{ width: 8, height: 8, background: "var(--accent-primary)", borderRadius: "50%", boxShadow: "0 0 10px var(--accent-primary)" }} />
              {fetchingRecs
                ? `Syncing problems for ${selectedTopics.length} topic${selectedTopics.length > 1 ? "s" : ""}...`
                : (analysisMode === "deep" ? STEP_LABELS_DEEP : STEP_LABELS_QUICK)[loadingStep]}
            </div>
            {!fetchingRecs && loadingStep > 0 && (
              <div style={{ display: "flex", gap: 4, paddingLeft: 20 }}>
                {[1,2,3,4].map(s => (
                  <div key={s} style={{
                    height: 2, width: 36, borderRadius: 1,
                    background: s <= loadingStep ? "var(--accent-primary)" : "var(--border-color)",
                    transition: "background 0.3s ease",
                  }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          margin: "16px 36px",
          padding: "16px 20px",
          background: "rgba(248, 113, 113, 0.05)",
          border: "1px solid rgba(248, 113, 113, 0.2)",
          borderRadius: 12,
          color: "var(--accent-danger)",
          fontSize: 14,
          maxWidth: 600,
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
          <AlertIcon size={18} />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!user && !loading && !error && (
        <div style={{ padding: "100px 36px", textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ 
            width: 64, height: 64, 
            background: "rgba(0, 255, 131, 0.05)", 
            borderRadius: 16, 
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 24px",
            color: "var(--accent-primary)"
          }}>
            <LogoIcon size={32} />
          </div>
          <div className="font-heading" style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>
            Performance Insights
          </div>
          <div style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Submit a Codeforces handle to generate a comprehensive skill profile and personalized problem set based on your competitive history.
          </div>
          <div style={{ fontSize: 12, marginTop: 20, color: "rgba(148, 163, 184, 0.4)", fontWeight: 500, letterSpacing: "0.02em" }}>
            Last 1,000 Submissions · Weak Spot Identification · Growth Trajectory
          </div>
        </div>
      )}

      {/* Dashboard */}
      {user && (
        <div
          className="fade-in dashboard-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: 20,
            padding: "30px 36px",
          }}
        >
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ProfileCard
              user={user}
              tagCount={tagProfile.length}
              weakCount={weakTags.length}
            />
            <WeakAreas weakTags={weakTags} selectedTag={activeWeakTag} onSelectTag={selectWeakTag} />
            <TagOverview tags={tagProfile} />
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {tagProfile.length > 0 && <SkillChart tags={tagProfile} />}

            {/* No weak areas banner */}
            {weakTags.length === 0 && tagProfile.length > 0 && (
              <div style={{
                background: "rgba(74, 222, 128, 0.04)",
                border: "1px solid rgba(74, 222, 128, 0.15)",
                borderRadius: 12,
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}>
                <div style={{ 
                  color: "var(--accent-success)", 
                  background: "rgba(74, 222, 128, 0.1)", 
                  width: 36, height: 36, 
                  borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0 
                }}>
                  <CheckIcon size={20} />
                </div>
                <div>
                  <div className="font-heading" style={{ fontWeight: 800, fontSize: 15, color: "var(--accent-success)", marginBottom: 4 }}>
                    Optimal Performance Maintained
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    You have achieved an efficiency rating above 65% in all currently practiced domains. Consider exploring new mathematical or algorithmic territories below.
                  </div>
                </div>
              </div>
            )}

            {/* Topic picker — shown only when no weak areas */}
            {suggestedTopics.length > 0 && weakTags.length === 0 && (
              <TopicPicker
                topics={suggestedTopics}
                selected={selectedTopics}
                onToggle={toggleTopic}
                onConfirm={fetchForSelectedTopics}
                loading={fetchingRecs}
              />
            )}

            {/* Recommendations */}
            {recs.length > 0 && (
              <Recommendations
                recs={recs}
                userRating={user.rating || 1200}
                selectedTopics={selectedTopics}
                solvedSet={solvedSet}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
