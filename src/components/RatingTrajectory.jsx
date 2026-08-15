// Greenhouse Phase 4a — RatingTrajectory dashboard section (spec §5.2 #5).
// CF-only: LeetCode handles render a disabled card with a caption (never an error).
// Hand-built SVG line chart (spec §13.3 — no charting lib for the new sections),
// self-fetching via backendClient with sealed empty-state + retry (§8).
import { useEffect, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { TrendUpIcon } from "./Icons";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import { getRatingTrajectory } from "../api/backendClient.js";
import { panelTransition } from "../lib/motion.js";

const CHART_W = 560;
const CHART_H = 150;
const PAD_L = 42;
const PAD_R = 14;
const PAD_T = 12;
const PAD_B = 22;

export default function RatingTrajectory() {
  const { cfHandle } = useAnalysisContext();
  const [points, setPoints] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const run = useCallback(async (controller) => {
    setLoading(true);
    setError("");
    try {
      const data = await getRatingTrajectory(cfHandle.trim(), controller.signal);
      setPoints(data.points || []);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to load rating history.");
    } finally {
      setLoading(false);
    }
  }, [cfHandle]);

  // Async IIFE keeps setState off the synchronous effect path (react-hooks/
  // set-state-in-effect); the cancelled flag mirrors useGraphLayout's pattern.
  useEffect(() => {
    if (!cfHandle) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;
    (async () => { await run(controller); if (cancelled) setLoading(false); })();
    return () => { cancelled = true; controller.abort(); };
  }, [cfHandle, run]);

  const retry = () => {
    const controller = new AbortController();
    abortRef.current = controller;
    run(controller);
  };

  if (!cfHandle) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
        <div className="card dash-traj" style={{ padding: 24 }}>
          <div className="dash-traj-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
              <TrendUpIcon size={16} />
            </div>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Rating trajectory</div>
          </div>
          <p data-testid="traj-disabled" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: 0 }}>
            Rating history is only available for Codeforces handles.
          </p>
        </div>
      </motion.div>
    );
  }

  const renderBody = () => {
    if (loading && !points) {
      return <div data-testid="traj-loading" style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading rating history…</div>;
    }
    if (error) {
      return (
        <div data-testid="traj-error" style={{ padding: "18px 0", textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: "0 0 12px" }}>{error}</p>
          <button className="btn-primary" data-testid="traj-retry" onClick={retry} style={{ padding: "8px 18px", fontSize: 13 }}>
            Retry
          </button>
        </div>
      );
    }
    if (!points || points.length === 0) {
      return <p data-testid="traj-empty" style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: 0 }}>No rated contests yet for this handle.</p>;
    }
    return <TrajectoryChart points={points} />;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
      <div className="card dash-traj" style={{ padding: 24 }}>
        <div className="dash-traj-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
            <TrendUpIcon size={16} />
          </div>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Rating trajectory</div>
        </div>
        {renderBody()}
      </div>
    </motion.div>
  );
}

function TrajectoryChart({ points }) {
  const ratings = points.map((p) => p.new_rating ?? p.old_rating ?? 0);
  const min = Math.min(...ratings);
  const max = Math.max(...ratings);
  const span = Math.max(max - min, 1);
  const n = ratings.length;

  const xOf = (i) => PAD_L + (i * (CHART_W - PAD_L - PAD_R)) / Math.max(n - 1, 1);
  const yOf = (r) => PAD_T + ((max - r) / span) * (CHART_H - PAD_T - PAD_B);

  const line = ratings.map((r, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(r).toFixed(1)}`).join(" ");
  const last = ratings[n - 1];
  const peak = Math.max(...ratings);
  const peakContest = points[ratings.indexOf(peak)]?.contest_name || "—";
  const midY = PAD_T + ((max - (min + max) / 2) / span) * (CHART_H - PAD_T - PAD_B);

  return (
    <div>
      {/* §9 sibling summary — nothing image-only */}
      <p data-testid="traj-summary" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: "0 0 8px" }}>
        Rating over <strong style={{ color: "var(--on-surface)" }}>{n}</strong> rated contests —
        peak <strong style={{ color: "var(--color-accent-text)" }}>{peak}</strong> ({peakContest}),
        current <strong style={{ color: "var(--on-surface)" }}>{last}</strong>.
      </p>
      <svg data-testid="traj-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={`Rating history line chart, peak ${peak}, current ${last}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {/* Horizontal gridline at the mid rating */}
        <line x1={PAD_L} y1={midY} x2={CHART_W - PAD_R} y2={midY} stroke="rgba(148,163,184,0.15)" strokeWidth={1} strokeDasharray="3 4" />
        <text x={PAD_L - 6} y={midY + 3.5} fontSize={9} fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">{Math.round((min + max) / 2)}</text>
        {/* Axis labels: min/max rating + first/last contest index */}
        <text x={PAD_L - 6} y={PAD_T + 3.5} fontSize={9} fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">{max}</text>
        <text x={PAD_L - 6} y={CHART_H - PAD_B + 3} fontSize={9} fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">{min}</text>
        <text x={PAD_L} y={CHART_H - 4} fontSize={9} fill="var(--text-muted)" fontFamily="var(--font-mono)">1</text>
        <text x={CHART_W - PAD_R} y={CHART_H - 4} fontSize={9} fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">{n}</text>
        {/* Rating polyline */}
        <path data-testid="traj-line" d={line} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {/* Current-rating dot */}
        <circle cx={xOf(n - 1)} cy={yOf(last)} r={3.5} fill="var(--color-accent)" stroke="var(--surface-base)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}