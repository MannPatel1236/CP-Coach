import { motion } from "framer-motion";
import { ZapIcon, BarChartIcon, TargetIcon, TrendUpIcon, CheckIcon } from "./Icons";
import SearchBar from "./SearchBar";
import { fadeUp, staggerContainer } from "../lib/motion";

const FEATURES = [
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
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Enter Your Handle",
    desc: "Provide your Codeforces or LeetCode username. Our system fetches your full submission history and rating data."
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
];

const STATS = [
  { value: "1.6M+", label: "Competitive Programmers on Codeforces" },
  { value: "100+", label: "Rated Contests Per Year" },
  { value: "2–4", label: "Hours/Day Top Coders Practice" },
];

export default function LandingPage({ 
  handle, setHandle, 
  cfHandle, setCfHandle,
  lcHandle, setLcHandle,
  onAnalyze, loading, onClear, 
  analysisMode, setAnalysisMode, 
  platform, setPlatform, 
  combinedPlatform, setCombinedPlatform 
}) {
  return (
    <div className="hero-landing" style={{ paddingBottom: 80 }}>
      {/* Hero */}
      <motion.div
        className="hero-section"
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        style={{
          position: "relative",
          padding: "80px 48px 60px",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        {/* Decorative orbital rings */}
        <div className="orbital-ring" style={{
          position: "absolute",
          top: "20%",
          right: "-10%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          border: "1px solid rgba(99, 102, 241, 0.08)",
          pointerEvents: "none",
        }} />
        <div className="orbital-ring" style={{
          position: "absolute",
          top: "30%",
          right: "-5%",
          width: 300,
          height: 300,
          borderRadius: "50%",
          border: "1px solid rgba(99, 102, 241, 0.05)",
          pointerEvents: "none",
        }} />

        <motion.div
          className="glow-pulse"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
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
            Smart Analytics
          </span>
        </motion.div>

        <motion.h1
          className="font-heading hero-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.2, 0, 0.2, 1] }}
          style={{
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            maxWidth: 640,
            marginBottom: 20,
            background: "linear-gradient(135deg, #ffffff 0%, var(--primary-bright) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Master Competitive Programming
        </motion.h1>

        <motion.p
          className="hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.2, 0, 0.2, 1] }}
          style={{
            fontSize: 18,
            color: "var(--on-surface-variant)",
            lineHeight: 1.7,
            maxWidth: 540,
            marginBottom: 40,
          }}
        >
          Identify your weaknesses, track your progress, and get personalized
          problem recommendations to climb the ranks.
        </motion.p>

        {/* Search bar in hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.45 }}
        >
          <SearchBar
            handle={handle}
            setHandle={setHandle}
            cfHandle={cfHandle}
            setCfHandle={setCfHandle}
            lcHandle={lcHandle}
            setLcHandle={setLcHandle}
            onAnalyze={onAnalyze}
            loading={loading}
            hasResult={false}
            onClear={onClear}
            analysisMode={analysisMode}
            setAnalysisMode={setAnalysisMode}
            platform={platform}
            setPlatform={setPlatform}
            combinedPlatform={combinedPlatform}
            setCombinedPlatform={setCombinedPlatform}
          />
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="stats-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          style={{
            display: "flex",
            gap: 48,
            flexWrap: "wrap",
            marginTop: 60,
          }}
        >
          {STATS.map((stat) => (
            <div key={stat.label}>
              <div className="font-heading" style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", marginBottom: 4 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Features Grid */}
      <div className="features-section" style={{ padding: "60px 48px", borderTop: "1px solid var(--outline)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <motion.span
              className="label-caps"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px" }}
              transition={{ duration: 0.5 }}
              style={{ display: "block", marginBottom: 12 }}
            >
              Features
            </motion.span>
            <motion.h2
              className="font-heading features-section-title"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              style={{ fontSize: 32, fontWeight: 700, marginBottom: 12 }}
            >
              Everything you need to improve
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px" }}
              transition={{ duration: 0.5, delay: 0.2 }}
              style={{ fontSize: 16, color: "var(--on-surface-variant)", maxWidth: 480, margin: "0 auto" }}
            >
              Deep analytics, smart recommendations, and progress tracking all in one place.
            </motion.p>
          </div>

          <div
            className="features-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {FEATURES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{
                  y: -4,
                  borderColor: "var(--primary-container)",
                  boxShadow: "0 0 32px var(--primary-glow)",
                  transition: { duration: 0.25 }
                }}
                viewport={{ once: true, margin: "0px" }}
                transition={{ delay: i * 0.08, duration: 0.4, ease: [0.2, 0, 0.2, 1] }}
                style={{
                  padding: 24,
                  background: "var(--surface-1)",
                  border: "1px solid var(--outline)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <motion.div
                  whileHover={{ scale: 1.08 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    width: 40,
                    height: 40,
                    background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
                    borderRadius: "var(--radius-sm)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--on-primary)",
                    marginBottom: 16,
                  }}
                >
                  <feature.icon size={18} />
                </motion.div>
                <h3 className="font-heading" style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6 }}>
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="how-it-works-section" style={{ padding: "60px 48px", borderTop: "1px solid var(--outline)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <motion.span
              className="label-caps"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px" }}
              transition={{ duration: 0.5 }}
              style={{ display: "block", marginBottom: 12 }}
            >
              How It Works
            </motion.span>
            <motion.h2
              className="font-heading"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              style={{ fontSize: 32, fontWeight: 700 }}
            >
              Three steps to better performance
            </motion.h2>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "0px" }}
            variants={staggerContainer}
            style={{ display: "flex", flexDirection: "column", gap: 24 }}
          >
            {HOW_IT_WORKS.map((item) => (
              <motion.div
                key={item.step}
                className="how-it-works-item"
                variants={fadeUp}
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
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* CTA Section */}
      <motion.div
        className="cta-section"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px" }}
        transition={{ duration: 0.6 }}
        style={{
          padding: "80px 48px",
          textAlign: "center",
          borderTop: "1px solid var(--outline)",
        }}
      >
        <h2 className="font-heading cta-title" style={{ fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
          Ready to improve?
        </h2>
        <p style={{ fontSize: 16, color: "var(--on-surface-variant)", marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
          Enter your Codeforces or LeetCode handle above and get your personalized
          analysis in seconds.
        </p>
      </motion.div>

      {/* Footer */}
      <div className="footer-section" style={{
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
  );
}
