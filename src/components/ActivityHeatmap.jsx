// Greenhouse Phase 4c — ActivityHeatmap + Streaks dashboard section (spec §5.2 #7).
// Derives from submission timestamps, so it works on rule_based AND graph_dkt
// paths alike (no mastery dependency). Weekly buckets (locked decision): 12-week
// grid colored by solved count + current/longest weekly streaks. Hand-built CSS
// grid (§13.3); sealed empty-state + retry (§8).
import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { CalendarIcon } from "./Icons";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import { getProgress } from "../api/backendClient.js";
import { panelTransition } from "../lib/motion.js";

const N_WEEKS = 12;

export default function ActivityHeatmap() {
  const { cfHandle, lcHandle, user } = useAnalysisContext();
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const handle = cfHandle || lcHandle || (user && user.handle) || "";

  const run = useCallback(async (controller) => {
    setLoading(true);
    setError("");
    try {
      const data = await getProgress(handle.trim(), controller.signal);
      setActivity(data.activity || {});
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to load activity.");
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => { await run(controller); if (cancelled) setLoading(false); })();
    return () => { cancelled = true; controller.abort(); };
  }, [handle, run]);

  const retry = () => {
    const controller = new AbortController();
    abortRef.current = controller;
    run(controller);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
      <div className="card dash-heat" style={{ padding: 24 }}>
        <div className="dash-heat-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
            <CalendarIcon size={16} />
          </div>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Activity + streaks</div>
        </div>

        {loading && !activity && !error ? (
          <div data-testid="heat-loading" style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading activity…</div>
        ) : error ? (
          <div data-testid="heat-error" style={{ padding: "18px 0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: "0 0 12px" }}>{error}</p>
            <button className="btn-primary" data-testid="heat-retry" onClick={retry} style={{ padding: "8px 18px", fontSize: 13 }}>
              Retry
            </button>
          </div>
        ) : !activity || Object.keys(activity).length === 0 ? (
          <p data-testid="heat-empty" style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: 0 }}>No recent activity for this handle.</p>
        ) : (
          <HeatGrid activity={activity} />
        )}
      </div>
    </motion.div>
  );
}

function HeatGrid({ activity }) {
  const weeks = Object.keys(activity).sort();
  const recent = weeks.slice(-N_WEEKS);
  const solvedOf = (w) => activity[w]?.solved ?? 0;
  const activeWeeks = recent.filter((w) => solvedOf(w) > 0).length;

  const streakRuns = [];
  let run = 0;
  for (const w of weeks) {
    if (solvedOf(w) > 0) { run += 1; } else { if (run > 0) streakRuns.push(run); run = 0; }
  }
  if (run > 0) streakRuns.push(run);
  const longest = streakRuns.length ? Math.max(...streakRuns) : 0;
  // Current streak ends at the latest week — an inactive latest week breaks it.
  const current = solvedOf(weeks[weeks.length - 1]) > 0 ? (streakRuns[streakRuns.length - 1] || 0) : 0;

  return (
    <div>
      {/* §9 sibling summary — nothing image-only */}
      <p data-testid="heat-summary" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: "0 0 12px" }}>
        Activity across the last <strong style={{ color: "var(--on-surface)" }}>{recent.length}</strong> weeks —
        <strong style={{ color: "var(--on-surface)" }}> {activeWeeks}</strong> with submissions,
        longest streak <strong style={{ color: "var(--color-accent-text)" }}>{longest}</strong> week{longest === 1 ? "" : "s"},
        current streak <strong style={{ color: "var(--on-surface)" }}>{current}</strong>.
      </p>
      <div data-testid="heat-grid" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {recent.map((w) => {
          const solved = solvedOf(w);
          return (
            <div
              key={w}
              data-testid="heat-cell"
              data-week={w}
              data-solved={solved}
              title={`${w}: ${solved} solved of ${activity[w]?.total ?? 0} attempts`}
              style={{
                width: 30, height: 30, borderRadius: "var(--radius-sm)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontFamily: "var(--font-mono)",
                background: cellColor(solved),
                color: solved > 0 ? "rgba(20,22,34,0.85)" : "var(--text-muted)",
                border: solved > 0 ? "1px solid var(--primary-bright)" : "1px solid var(--outline-variant)",
              }}
            >
              {solved > 0 ? solved : ""}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cellColor(solved) {
  if (solved <= 0) return "rgba(148,163,184,0.08)";
  if (solved === 1) return "rgba(99,102,241,0.35)";
  if (solved === 2) return "rgba(99,102,241,0.55)";
  if (solved === 3) return "rgba(99,102,241,0.72)";
  return "rgba(129,140,248,0.95)";
}