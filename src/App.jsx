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
    <div style={{ minHeight: "100vh", background: "var(--surface-base)", color: "var(--on-surface)", paddingBottom: 80 }}>
      <Header onHome={clearResults} />

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
        <div style={{ padding: "20px 48px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, color: "var(--primary)", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-body)", letterSpacing: "0.1em" }}>
              <div className="pulse" style={{ width: 8, height: 8, background: "var(--primary-container)", borderRadius: "2px", boxShadow: "0 0 8px var(--primary-glow)" }} />
              {fetchingRecs
                ? `SYNCHRONIZING PROBLEMS...`
                : (analysisMode === "deep" ? STEP_LABELS_DEEP : STEP_LABELS_QUICK)[loadingStep].toUpperCase()}
            </div>
            {!fetchingRecs && loadingStep > 0 && (
              <div style={{ display: "flex", gap: 6, paddingLeft: 22 }}>
                {[1,2,3,4].map(s => (
                  <div key={s} style={{
                    height: 3, width: 48, borderRadius: "var(--radius-full)",
                    background: s <= loadingStep ? "var(--primary-container)" : "var(--surface-3)",
                    transition: "background 0.3s ease",
                    boxShadow: s <= loadingStep ? "0 0 8px var(--primary-glow)" : "none",
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
          margin: "16px 48px",
          padding: "20px 24px",
          background: "var(--error-container)",
          border: "1px solid rgba(255, 180, 171, 0.15)",
          borderRadius: "var(--radius-lg)",
          color: "var(--error)",
          fontSize: 14,
          maxWidth: 640,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "var(--font-body)"
        }}>
          <AlertIcon size={18} />
          {error}
        </div>
      )}

      {/* Empty state */}
      {!user && !loading && !error && (
        <div style={{ padding: "120px 36px", textAlign: "left", maxWidth: 640, margin: "0 auto 0 48px" }}>
          <div style={{ 
            width: 56, height: 56, 
            background: "rgba(93, 92, 255, 0.1)", 
            borderRadius: "var(--radius-sm)", 
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 32,
            color: "var(--primary-container)",
            boxShadow: "0 0 24px var(--primary-glow)",
          }}>
            <LogoIcon size={28} />
          </div>
          <div className="font-heading" style={{ fontSize: 48, fontWeight: 700, marginBottom: 16, letterSpacing: "-0.02em", lineHeight: 1.1, color: "#ffffff" }}>
            The Architect of Performance
          </div>
          <div style={{ fontSize: 18, color: "var(--on-surface-variant)", lineHeight: 1.6, fontFamily: "var(--font-body)", maxWidth: 520 }}>
            Identify technical bottlenecks with surgical precision. Submit a Codeforces handle to generate a bespoke profile and strategic growth path.
          </div>
          <div style={{ fontSize: 11, marginTop: 48, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-body)" }}>
            Metric Calibration · Deep Scan · Growth Trajectory
          </div>
        </div>
      )}

      {/* Dashboard */}
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
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <ProfileCard
              user={user}
              tagCount={tagProfile.length}
              weakCount={weakTags.length}
            />
            <WeakAreas weakTags={weakTags} selectedTag={activeWeakTag} onSelectTag={selectWeakTag} />
            <TagOverview tags={tagProfile} />
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {tagProfile.length > 0 && <SkillChart tags={tagProfile} />}

            {/* No weak areas banner */}
            {weakTags.length === 0 && tagProfile.length > 0 && tagProfile.every(t => t.solved >= 10) && (
              <div style={{
                background: "var(--success-container)",
                border: "1px solid rgba(74, 222, 128, 0.15)",
                borderRadius: "var(--radius-lg)",
                padding: "24px",
                display: "flex",
                alignItems: "center",
                gap: 20,
              }}>
                <div style={{ 
                  color: "var(--success)", 
                  background: "rgba(74, 222, 128, 0.1)", 
                  width: 40, height: 40, 
                  borderRadius: "var(--radius-full)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0 
                }}>
                  <CheckIcon size={22} />
                </div>
                <div>
                  <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "var(--success)", marginBottom: 4 }}>
                    Strategic Optimization Achieved
                  </div>
                  <div style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
                    You have maintained an efficiency rating above 65% across all domains.
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
