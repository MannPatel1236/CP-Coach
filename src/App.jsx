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
import { CheckIcon, AlertIcon, CodeIcon, TrendUpIcon, TargetIcon, ZapIcon, BarChartIcon } from "./components/Icons.jsx";

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
    } catch (err) {
      setError("Synchronization error. Please try again.");
    } finally {
      setFetchingRecs(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-base)", color: "var(--on-surface)" }}>
      <Header onHome={clearResults} />

      {/* Search bar at top when user exists */}
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

      {/* Loading */}
      {(loading || fetchingRecs) && (
        <div style={{ padding: "20px 48px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 640 }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              color: "var(--primary-bright)",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "var(--font-body)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              <div className="pulse" style={{
                width: 8, height: 8,
                background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
                borderRadius: 2,
                boxShadow: "0 0 12px var(--primary-glow)",
              }} />
              {fetchingRecs
                ? "Synchronizing Problems..."
                : (analysisMode === "deep" ? STEP_LABELS_DEEP : STEP_LABELS_QUICK)[loadingStep]}
            </div>
            {!fetchingRecs && loadingStep > 0 && (
              <div style={{ display: "flex", gap: 6, paddingLeft: 22 }}>
                {[1, 2, 3, 4].map(s => (
                  <div key={s} style={{
                    height: 3, width: 48, borderRadius: "var(--radius-full)",
                    background: s <= loadingStep
                      ? "linear-gradient(90deg, var(--primary-container), var(--primary-bright))"
                      : "var(--surface-3)",
                    transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
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
          padding: "18px 24px",
          background: "var(--error-container)",
          border: "1px solid rgba(248, 113, 113, 0.12)",
          borderRadius: "var(--radius-lg)",
          color: "var(--error)",
          fontSize: 14,
          maxWidth: 640,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "var(--font-body)",
          backdropFilter: "blur(8px)",
        }}>
          <div style={{
            width: 24, height: 24,
            background: "rgba(248, 113, 113, 0.1)",
            borderRadius: "var(--radius-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <AlertIcon size={14} />
          </div>
          {error}
        </div>
      )}

      {/* Landing Page — shown when no user and not loading */}
      {!user && !loading && !error && (
        <div style={{ paddingBottom: 80 }}>
          {/* Hero */}
          <div style={{
            position: "relative",
            padding: "80px 48px 60px",
            maxWidth: 900,
            margin: "0 auto",
          }}>
            {/* Decorative orbital rings */}
            <div style={{
              position: "absolute",
              top: "20%",
              right: "-10%",
              width: 400,
              height: 400,
              borderRadius: "50%",
              border: "1px solid rgba(99, 102, 241, 0.08)",
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute",
              top: "30%",
              right: "-5%",
              width: 300,
              height: 300,
              borderRadius: "50%",
              border: "1px solid rgba(99, 102, 241, 0.05)",
              pointerEvents: "none",
            }} />

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 16px",
                background: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.15)",
                borderRadius: "var(--radius-full)",
                marginBottom: 24,
              }}
            >
              <ZapIcon size={14} style={{ color: "var(--primary-bright)" }} />
              <span style={{ fontSize: 12, color: "var(--primary-bright)", fontWeight: 600 }}>
                AI-Powered Analysis
              </span>
            </div>

            <h1 className="font-heading" style={{
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              maxWidth: 640,
              marginBottom: 20,
              background: "linear-gradient(135deg, #ffffff 0%, var(--primary-bright) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}>
              Master Competitive Programming
            </h1>

            <p style={{
              fontSize: 18,
              color: "var(--on-surface-variant)",
              lineHeight: 1.7,
              maxWidth: 540,
              marginBottom: 40,
            }}>
              Identify your weaknesses, track your progress, and get personalized
              problem recommendations to climb the ranks.
            </p>

            {/* Search bar in hero */}
            <SearchBar
              handle={handle}
              setHandle={setHandle}
              onAnalyze={analyze}
              loading={loading}
              hasResult={false}
              onClear={clearResults}
              analysisMode={analysisMode}
              setAnalysisMode={setAnalysisMode}
            />

            {/* Stats row */}
            <div style={{
              display: "flex",
              gap: 48,
              flexWrap: "wrap",
              marginTop: 60,
            }}>
              {[
                { value: "1.6M+", label: "Competitive Programmers on Codeforces" },
                { value: "100+", label: "Rated Contests Per Year" },
                { value: "2–4", label: "Hours/Day Top Coders Practice" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="font-heading" style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Features Grid */}
          <div style={{ padding: "60px 48px", borderTop: "1px solid var(--outline)" }}>
            <div style={{ maxWidth: 1200, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 48 }}>
                <span className="label-caps" style={{ display: "block", marginBottom: 12 }}>
                  Features
                </span>
                <h2 className="font-heading" style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}>
                  Everything you need to improve
                </h2>
                <p style={{ fontSize: 16, color: "var(--on-surface-variant)", maxWidth: 480, margin: "0 auto" }}>
                  Deep analytics, smart recommendations, and progress tracking all in one place.
                </p>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
              }}>
                {[
                  {
                    icon: BarChartIcon,
                    title: "Deep Analytics",
                    desc: "Analyze your submission history to identify weak tags, track AC rates, and understand your problem-solving patterns."
                  },
                  {
                    icon: TargetIcon,
                    title: "Smart Recommendations",
                    desc: "Get tailored problem sets based on your current rating and weakest areas. Never waste time on the wrong problems."
                  },
                  {
                    icon: TrendUpIcon,
                    title: "Progress Tracking",
                    desc: "Monitor your rating trajectory and see how your skills evolve across different algorithmic topics over time."
                  },
                  {
                    icon: CheckIcon,
                    title: "Solve Streak Tracking",
                    desc: "Build consistent solving habits with streak tracking and daily challenge suggestions to keep you motivated."
                  },
                ].map((feature) => (
                  <div
                    key={feature.title}
                    style={{
                      padding: 24,
                      background: "var(--surface-1)",
                      border: "1px solid var(--outline)",
                      borderRadius: "var(--radius-lg)",
                      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--primary-container)";
                      e.currentTarget.style.boxShadow = "0 0 32px var(--primary-glow)";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--outline)";
                      e.currentTarget.style.boxShadow = "none";
                      e.currentTarget.style.transform = "none";
                    }}
                  >
                    <div style={{
                      width: 40,
                      height: 40,
                      background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--on-primary)",
                      marginBottom: 16,
                    }}>
                      <feature.icon size={18} />
                    </div>
                    <h3 className="font-heading" style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                      {feature.title}
                    </h3>
                    <p style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
                      {feature.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div style={{ padding: "60px 48px", borderTop: "1px solid var(--outline)" }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 48 }}>
                <span className="label-caps" style={{ display: "block", marginBottom: 12 }}>
                  How It Works
                </span>
                <h2 className="font-heading" style={{ fontSize: 32, fontWeight: 700 }}>
                  Three steps to better performance
                </h2>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {[
                  {
                    step: "01",
                    title: "Enter Your Handle",
                    desc: "Provide your Codeforces username. Our system fetches your full submission history and rating data."
                  },
                  {
                    step: "02",
                    title: "Get Your Analysis",
                    desc: "We analyze every submission to find your weak tags, compare against your rating, and build a complete skill profile."
                  },
                  {
                    step: "03",
                    title: "Practice Smarter",
                    desc: "Receive targeted problem recommendations at your exact level. Focus on what matters and track your progress."
                  },
                ].map((item) => (
                  <div
                    key={item.step}
                    style={{
                      display: "flex",
                      gap: 24,
                      alignItems: "flex-start",
                      padding: "24px",
                      background: "var(--surface-1)",
                      border: "1px solid var(--outline)",
                      borderRadius: "var(--radius-lg)",
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--on-primary)",
                        fontFamily: "var(--font-heading)",
                        fontSize: 14,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {item.step}
                    </div>
                    <div>
                      <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                        {item.title}
                      </h3>
                      <p style={{ fontSize: 14, color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div style={{
            padding: "80px 48px",
            textAlign: "center",
            borderTop: "1px solid var(--outline)",
          }}>
            <h2 className="font-heading" style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
              Ready to improve?
            </h2>
            <p style={{ fontSize: 16, color: "var(--on-surface-variant)", marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
              Enter your Codeforces handle above and get your personalized
              analysis in seconds.
            </p>
          </div>

          {/* Footer */}
          <div style={{
            padding: "24px 48px",
            borderTop: "1px solid var(--outline)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "var(--text-muted)",
          }}>
            <span>CP Coach</span>
            <span>Built for competitive programmers</span>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <ProfileCard user={user} tagCount={tagProfile.length} weakCount={weakTags.length} />
            <WeakAreas weakTags={weakTags} selectedTag={activeWeakTag} onSelectTag={selectWeakTag} />
            <TagOverview tags={tagProfile} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {tagProfile.length > 0 && <SkillChart tags={tagProfile} />}

            {weakTags.length === 0 && tagProfile.length > 0 && tagProfile.every(t => t.solved >= 10) && (
              <div style={{
                background: "linear-gradient(135deg, rgba(52, 211, 153, 0.04), transparent)",
                border: "1px solid rgba(52, 211, 153, 0.12)",
                borderRadius: "var(--radius-lg)",
                padding: "20px 22px",
                display: "flex",
                alignItems: "center",
                gap: 18,
                backdropFilter: "blur(8px)",
              }}>
                <div style={{
                  color: "var(--success)",
                  background: "rgba(52, 211, 153, 0.08)",
                  width: 40, height: 40,
                  borderRadius: "var(--radius-full)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <CheckIcon size={22} />
                </div>
                <div>
                  <div className="font-heading" style={{ fontWeight: 600, fontSize: 16, color: "var(--success)", marginBottom: 2 }}>
                    Strategic Optimization Achieved
                  </div>
                  <div style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: "var(--font-body)" }}>
                    You have maintained an efficiency rating above 65% across all domains.
                  </div>
                </div>
              </div>
            )}

            {suggestedTopics.length > 0 && weakTags.length === 0 && (
              <TopicPicker
                topics={suggestedTopics}
                selected={selectedTopics}
                onToggle={toggleTopic}
                onConfirm={fetchForSelectedTopics}
                loading={fetchingRecs}
              />
            )}

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
