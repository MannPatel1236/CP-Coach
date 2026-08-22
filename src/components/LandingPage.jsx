import { motion } from "framer-motion";
import SearchBar from "./SearchBar";
import LandingDAG from "./LandingDAG";
import { staggerContainer, panelTransition } from "../lib/motion.js";

// §3 lock 4 motion A — cinematic landing. Section/hero reveals stay UNDER the 560ms cap
// with a landing-local variant, so the shared `fadeUp` (600ms, from ../lib/motion, used
// across the dashboard) stays untouched (surgical — Rule 1). ponytail: 5-line local variant
// vs forking motion.js; if a 4th landing reveal wants the same easing, lift this into motion.js.
const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.54, ease: [0.2, 0, 0.2, 1] } }),
};

// §5.1 "How it works (3 steps)" — read handle → map onto graph → practice the frontier.
const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Read your handle",
    desc: "CP Coach fetches your full Codeforces or LeetCode submission history — every verdict, every tag, every rating band.",
  },
  {
    step: "02",
    title: "Map it onto the graph",
    desc: "Your submissions land on the 29-topic prerequisite graph. Weak tags, AC-rate drift, and prerequisite gaps become visible — the honest evidence behind your rating.",
  },
  {
    step: "03",
    title: "Practice the frontier",
    desc: "Get problems calibrated to your rating band, gated by the prerequisites you've already cleared. Spend each session where the graph says you're thin.",
  },
];

// §5.1 "Credibility stats" — real, verifiable product facts (independent of any research).
const CREDIBILITY = [
  { value: "8k", label: "submissions scanned per deep analysis — every verdict, tag, and rating band, weighted toward your recent form" },
  { value: "29", label: "topics on the prerequisite skill graph, wired by 39 dependency edges from implementation to matrices" },
  { value: "0", label: "accounts required — analyze any public handle, erase your data anytime" },
];

const section = { maxWidth: "var(--landing-max)", margin: "0 auto", padding: "80px 24px" };

export default function LandingPage() {
  return (
    <div className="landing-page" style={{ paddingBottom: 64 }}>
      {/* Hero — §5.1: headline + handle input + CTA + credibility micro-strip */}
      <section style={{ ...section, paddingTop: 120, maxWidth: 900 }}>
        <motion.p className="label-caps" initial="hidden" animate="visible" variants={fadeIn}
          style={{ color: "var(--color-accent-text)", marginBottom: 16 }}>
          A training journal for competitive programmers
        </motion.p>
        <motion.h1 className="font-heading" initial="hidden" animate="visible" variants={fadeIn} custom={1}
          style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
            fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.02em",
            maxWidth: "16ch", marginBottom: 20, color: "var(--on-surface)",
          }}>
          Where do you stand on the graph?
        </motion.h1>
        <motion.p initial="hidden" animate="visible" variants={fadeIn} custom={2}
          style={{ fontSize: 18, color: "var(--on-surface-variant)", lineHeight: 1.7, maxWidth: "52ch", marginBottom: 32 }}>
          CP Coach reads your submission history and maps it onto the competitive-programming
          prerequisite graph — every topic you touch grows from the foundations outward.
        </motion.p>
        <motion.div initial="hidden" animate="visible" variants={fadeIn} custom={3} style={{ marginBottom: 28 }}>
          <SearchBar />
        </motion.div>
        {/* §5.1 credibility micro-strip */}
        <motion.div data-testid="credibility-strip" initial="hidden" animate="visible" variants={fadeIn} custom={4}
          style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "baseline",
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
          <span><strong style={{ color: "var(--color-accent-text)" }}>29</strong>-topic skill graph</span>
          <span>·</span>
          <span><strong style={{ color: "var(--color-accent-text)" }}>CF + LC</strong></span>
          <span>·</span>
          <span>no account needed</span>
        </motion.div>
      </section>

      {/* DAG centerpiece (below the fold) — §5.1, §9. The LandingDAG IO fires the draw here. */}
      <section style={{ ...section, borderTop: "1px solid var(--outline)" }}>
        <motion.p className="label-caps" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }}
          variants={fadeIn} style={{ color: "var(--color-accent-text)", marginBottom: 12, textAlign: "center" }}>
          The prerequisite graph
        </motion.p>
        <motion.h2 className="font-heading" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }}
          variants={fadeIn} custom={1}
          style={{ fontFamily: "var(--font-display)", fontWeight: 600,
            fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.015em",
            textAlign: "center", maxWidth: "20ch", margin: "0 auto 32px" }}>
          Your knowledge, drawn from its roots.
        </motion.h2>
        <LandingDAG />
      </section>

      {/* Self-selection story — §5.1 "Why your rating is lying to you" (3 beats) */}
      <section data-testid="self-selection-story" style={{ ...section, borderTop: "1px solid var(--outline)", maxWidth: 760 }}>
        <motion.p className="label-caps" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }}
          variants={fadeIn} style={{ color: "var(--color-accent-text)", marginBottom: 12 }}>
          Why your rating is lying to you
        </motion.p>
        <motion.h2 className="font-heading" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }}
          variants={fadeIn} custom={1}
          style={{ fontFamily: "var(--font-display)", fontWeight: 600,
            fontSize: "clamp(1.6rem, 3vw, 2.1rem)", letterSpacing: "-0.015em", marginBottom: 24 }}>
          Self-selection sets a ceiling your rating can&apos;t see.
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }} variants={staggerContainer}
          style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {[
            { n: "01", p: "Competitive programmers practice what they're already good at. Watch any solver's history and you'll see streaks — same tag, same difficulty band, night after night." },
            { n: "02", p: "Streaks feel like progress, and rating rewards them. But a rating is one number across ten tiers of skill — it can't tell you that your graphs are carried by your dp." },
            { n: "03", p: "Your rating reports the streak. CP Coach reports the gaps underneath it — the prerequisite frontier you keep skipping. That's where the next problem lives." },
          ].map((beat) => (
            <motion.div key={beat.n} variants={fadeIn} style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--color-accent-text)", flexShrink: 0 }}>
                {beat.n}
              </span>
              <p style={{ fontSize: 16, color: "var(--on-surface-variant)", lineHeight: 1.7 }}>{beat.p}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Credibility stats strip */}
      <section style={{ ...section, borderTop: "1px solid var(--outline)" }}>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }} variants={staggerContainer}
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
          {CREDIBILITY.map((c) => (
            <motion.div key={c.label} variants={fadeIn}
              style={{ padding: 24, background: "var(--surface-1)", border: "1px solid var(--outline)", borderRadius: "var(--radius-lg)" }}>
              <div className="font-heading" style={{ fontFamily: "var(--font-display)", fontSize: 28,
                fontWeight: 600, color: "var(--color-accent-text)", marginBottom: 8 }}>{c.value}</div>
              <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.6, fontFamily: "var(--font-mono)" }}>{c.label}</div>
            </motion.div>
          ))}
        </motion.div>
        <motion.p initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }} variants={fadeIn}
          style={{ marginTop: 32, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Knowledge tracing over a 29-topic competitive-programming prerequisite graph
        </motion.p>
      </section>

      {/* How it works (3 steps) */}
      <section style={{ ...section, borderTop: "1px solid var(--outline)", maxWidth: 800 }}>
        <motion.p className="label-caps" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }}
          variants={fadeIn} style={{ color: "var(--color-accent-text)", marginBottom: 12, textAlign: "center" }}>
          How it works
        </motion.p>
        <motion.h2 className="font-heading" initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }}
          variants={fadeIn} custom={1}
          style={{ fontFamily: "var(--font-display)", fontWeight: 600,
            fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.015em", textAlign: "center", marginBottom: 40 }}>
          Three steps onto the graph.
        </motion.h2>
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "0px" }} variants={staggerContainer}
          style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {HOW_IT_WORKS.map((item) => (
            <motion.div key={item.step} variants={fadeIn}
              style={{ display: "flex", gap: 24, alignItems: "flex-start", padding: 24,
                background: "var(--surface-1)", border: "1px solid var(--outline)", borderRadius: "var(--radius-lg)" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%",
                background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
                display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)",
                fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{item.step}</div>
              <div>
                <h3 className="font-heading" style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, marginBottom: 6 }}>{item.title}</h3>
                <p style={{ fontSize: 14, color: "var(--on-surface-variant)", lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Final CTA + minimal footer */}
      <motion.section initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px" }}
        transition={panelTransition}
        style={{ ...section, borderTop: "1px solid var(--outline)", textAlign: "center", maxWidth: 640 }}>
        <h2 className="font-heading" style={{ fontFamily: "var(--font-display)", fontWeight: 600,
          fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.015em", marginBottom: 16 }}>
          Find your frontier.
        </h2>
        <p style={{ fontSize: 16, color: "var(--on-surface-variant)", marginBottom: 8, maxWidth: "40ch", margin: "0 auto" }}>
          Enter your Codeforces or LeetCode handle above and watch the graph build from your foundations outward.
        </p>
      </motion.section>

      <footer style={{ padding: "24px", borderTop: "1px solid var(--outline)",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
        maxWidth: "var(--landing-max)", margin: "0 auto" }}>
        <span>CP Coach</span>
        <span>analyze · activity · trajectory · mastery · recommend · progress · compare · streaks · workbook · explain</span>
      </footer>
    </div>
  );
}