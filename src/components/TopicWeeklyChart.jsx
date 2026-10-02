// Weekly fused-mastery chart for a single topic (retroactive, carry-forward).
// Hand-built SVG (repo convention: no charting lib for Phase-4+ sections).
// interactive=true adds hover hit areas + a score tooltip (Analytics card).
import { useState } from "react";
import { labelOf } from "../lib/topicGraphLayout.js";

const CHART_W = 560;
const CHART_H = 150;
const PAD_L = 42;
const PAD_R = 14;
const PAD_T = 12;
const PAD_B = 22;
const LINE_COLORS = { CF: "var(--color-accent)", LC: "var(--warning)" };

export default function TopicWeeklyChart({ topic, weeks, series, interactive = false }) {
  const [hover, setHover] = useState(null);

  if (!series || series.length === 0) {
    return (
      <p data-testid="weekly-empty" style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: 0 }}>
        No weekly history for this topic yet.
      </p>
    );
  }

  const labels = (weeks && weeks.length ? weeks : series[0].weeks) || [];
  const n = labels.length;
  const xOf = (i) => PAD_L + (i * (CHART_W - PAD_L - PAD_R)) / Math.max(n - 1, 1);
  const yOf = (p) => PAD_T + (1 - p) * (CHART_H - PAD_T - PAD_B);

  const pathFor = (points) => {
    const parts = [];
    let open = false;
    points.forEach((p, i) => {
      if (p == null) { open = false; return; }
      parts.push(`${open ? "L" : "M"}${xOf(i).toFixed(1)},${yOf(p).toFixed(1)}`);
      open = true;
    });
    return parts.join(" ");
  };

  const tickIndices = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
  const summaries = series.map(({ label, points }) => {
    const cur = points[n - 1];
    const prev = n > 1 ? points[n - 2] : null;
    const delta = cur != null && prev != null ? Math.round((cur - prev) * 100) : null;
    return { label, cur, prev, delta };
  });
  const fmt = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const fmtDelta = (d) => (d == null ? "—" : `${d > 0 ? "+" : ""}${d} pts`);

  const hoverRows = hover == null
    ? []
    : series
        .map(({ label, points }) => ({ label, p: points[hover] }))
        .filter((row) => row.p != null);

  return (
    <div>
      <p data-testid="weekly-summary" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: "0 0 8px" }}>
        Weekly mastery for <strong style={{ color: "var(--on-surface)" }}>{labelOf(topic)}</strong>
        {summaries.map(({ label, cur, prev, delta }) => (
          <span key={label}>
            {" — "}{label}: current <strong style={{ color: "var(--color-accent-text)" }}>{fmt(cur)}</strong>,
            previous {fmt(prev)}, <strong style={{ color: "var(--color-accent-text)" }}>{fmtDelta(delta)}</strong>
          </span>
        ))}
      </p>
      {series.length > 1 && (
        <div data-testid="weekly-legend" style={{ display: "flex", gap: 14, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--on-surface-variant)", marginBottom: 6 }}>
          {series.map(({ label }) => (
            <span key={label}>
              <span style={{ color: LINE_COLORS[label] }}>■</span> {label}
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <svg data-testid="weekly-chart" viewBox={`0 0 ${CHART_W} ${CHART_H}`} role="img" aria-label={`Weekly mastery chart for ${labelOf(topic)}`} style={{ width: "100%", height: "auto", display: "block" }}>
          {[0, 0.5, 1].map((p) => (
            <g key={p}>
              <line x1={PAD_L} y1={yOf(p)} x2={CHART_W - PAD_R} y2={yOf(p)} stroke="rgba(148,163,184,0.15)" strokeWidth={1} strokeDasharray="3 4" />
              <text x={PAD_L - 6} y={yOf(p) + 3.5} fontSize={9} fill="var(--text-muted)" textAnchor="end" fontFamily="var(--font-mono)">{Math.round(p * 100)}%</text>
            </g>
          ))}
          {tickIndices.map((i) => (
            labels[i] ? (
              <text key={i} x={xOf(i)} y={CHART_H - 4} fontSize={9} fill="var(--text-muted)" fontFamily="var(--font-mono)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {labels[i]}
              </text>
            ) : null
          ))}
          {interactive && hover != null && (
            <line data-testid="weekly-guide" x1={xOf(hover)} y1={PAD_T} x2={xOf(hover)} y2={CHART_H - PAD_B} stroke="rgba(148,163,184,0.45)" strokeWidth={1} strokeDasharray="3 3" />
          )}
          {series.map(({ label, points }) => (
            <g key={label}>
              <path data-testid={`weekly-line-${label}`} d={pathFor(points)} fill="none" stroke={LINE_COLORS[label]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {points[n - 1] != null && (
                <circle cx={xOf(n - 1)} cy={yOf(points[n - 1])} r={3.5} fill={LINE_COLORS[label]} stroke="var(--surface-base)" strokeWidth={1.5} />
              )}
            </g>
          ))}
          {interactive && hover != null && series.map(({ label, points }) => (
            points[hover] == null ? null : (
              <circle key={label} cx={xOf(hover)} cy={yOf(points[hover])} r={4.5} fill={LINE_COLORS[label]} stroke="var(--surface-base)" strokeWidth={1.5} style={{ pointerEvents: "none" }} />
            )
          ))}
          {interactive && Array.from({ length: n }).map((_, i) => {
            const anchor = series.find(({ points }) => points[i] != null);
            if (!anchor) return null;
            return (
              <circle
                key={`hit-${i}`}
                data-testid={`weekly-hit-${i}`}
                cx={xOf(i)}
                cy={yOf(anchor.points[i])}
                r={12}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              />
            );
          })}
        </svg>
        {interactive && hover != null && hoverRows.length > 0 && (
          <div
            data-testid="weekly-tooltip"
            aria-hidden="true"
            style={{ position: "absolute", top: 0, left: `${(xOf(hover) / CHART_W) * 100}%`, transform: "translateX(-50%)", background: "var(--surface-2)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--on-surface)", pointerEvents: "none", whiteSpace: "nowrap" }}
          >
            <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{labels[hover]}</div>
            {hoverRows.map(({ label, p }) => (
              <div key={label}><span style={{ color: LINE_COLORS[label] }}>■</span> {label} {Math.round(p * 100)}%</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
