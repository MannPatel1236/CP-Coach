import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { InfoIcon } from "./Icons";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import useGraphLayout from "../hooks/useGraphLayout.js";
import { panelTransition } from "../lib/motion.js";
import {
  prereqPath,
  pillWidth, getEdgeEndpoints, bezierPathD, labelOf,
  PILL_H, PILL_RX, ARROW_SIZE,
} from "../lib/topicGraphLayout.js";

export default function SkillFrontier() {
  const { masteryScoresRef, weakTags, activeWeakTag, modelUsed } = useAnalysisContext();
  const { graphData, layout, depths } = useGraphLayout();
  const [selected, setSelected] = useState(null);     // click → reveal prereq chain
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);

  const isEstimate = modelUsed !== "graph_dkt";  // §8: rule_based / stats_only / client Path B / null
  // Plan contract: read mastery ref directly. Safe because useAnalysis mutates the ref only
  // immediately before setModelUsed() → the paired state flip re-renders with fresh mastery.
  // eslint-disable-next-line react-hooks/refs
  const mastery = (masteryScoresRef && masteryScoresRef.current) || {};

  const weakSet = useMemo(() => new Set((weakTags || []).map((t) => t.tag)), [weakTags]);
  const chain = useMemo(
    () => (selected ? prereqPath((graphData && graphData.edges) || [], selected) : []),
    [selected, graphData]
  );
  const pathSet = useMemo(() => new Set(chain), [chain]);
  const pathEdgeSet = useMemo(() => {
    const s = new Set();
    for (let i = 0; i < chain.length - 1; i++) s.add(chain[i] + "::" + chain[i + 1]);
    return s;
  }, [chain]);

  if (!graphData) return null;

  const topWeak = (weakTags || []).slice().sort((a, b) => a.acRate - b.acRate).slice(0, 3);
  const summaryLine = topWeak.length
    ? "Top " + topWeak.length + " weak topic" + (topWeak.length > 1 ? "s" : "") + ": " +
      topWeak.map((t) => t.tag + " " + ((mastery[t.tag] != null ? mastery[t.tag] : 0)).toFixed(2)).join(", ")
    : "No weak topics detected.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={panelTransition} style={{ margin: 0 }}
    >
      <div className="card dash-frontier" style={{ padding: 24 }}>
        {/* Header + §8 provenance badge + §8 cached chip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
              <InfoIcon size={16} />
            </div>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Skill Frontier</div>
            {isEstimate && (
              <span data-testid="estimate-badge" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--warning)", background: "var(--warning-container)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "var(--radius-full)", padding: "3px 8px" }}>
                estimate · not graph-dkt
              </span>
            )}
          </div>
          {graphData.fromFallback && (
            <span data-testid="cached-chip" style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", border: "1px dashed var(--outline-variant)", borderRadius: "var(--radius-full)", padding: "3px 10px" }}>
              cached · graph offline
            </span>
          )}
        </div>

        {/* §9 sibling text summary (above the SVG) */}
        <div data-testid="frontier-summary" style={{ fontSize: 12, color: "var(--color-accent-text)", fontFamily: "var(--font-mono)", marginBottom: 12, lineHeight: 1.6 }}>{summaryLine}</div>
        <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.6, marginBottom: 12 }}>
          Arrows show prerequisites (A → B: A required before B). Click a node — or focus + Enter / Space — to reveal its prerequisite chain from <code style={{ fontFamily: "var(--font-mono)" }}>implementation</code>.
        </div>

        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -8px", padding: "0 8px" }}>
          <svg viewBox={"0 0 " + layout.svgWidth + " " + layout.svgHeight} style={{ minWidth: layout.svgWidth, height: "auto", userSelect: "none", display: "block" }} role="group" aria-label="Skill frontier prerequisite graph">
            <defs>
              <filter id="glow-weak" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor="var(--error)" floodOpacity="0.35" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="colored-blur" />
                <feMerge><feMergeNode in="colored-blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <marker id="arrow" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE - 1} refY={ARROW_SIZE / 2} orient="auto" markerUnits="userSpaceOnUse">
                <path d={"M0,1 L" + (ARROW_SIZE - 1) + "," + (ARROW_SIZE / 2) + " L0," + (ARROW_SIZE - 1)} fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
              </marker>
              <marker id="arrow-dim" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE - 1} refY={ARROW_SIZE / 2} orient="auto" markerUnits="userSpaceOnUse">
                <path d={"M0,1 L" + (ARROW_SIZE - 1) + "," + (ARROW_SIZE / 2) + " L0," + (ARROW_SIZE - 1)} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1.5" strokeLinejoin="round" />
              </marker>
              <marker id="arrow-highlight" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE - 1} refY={ARROW_SIZE / 2} orient="auto" markerUnits="userSpaceOnUse">
                <path d={"M0,1 L" + (ARROW_SIZE - 1) + "," + (ARROW_SIZE / 2) + " L0," + (ARROW_SIZE - 1)} fill="none" stroke="var(--primary-bright)" strokeWidth="1.5" strokeLinejoin="round" />
              </marker>
            </defs>

            {/* EDGES */}
            {layout.edges.map((e, i) => {
              const ep = getEdgeEndpoints(e.source, e.target);
              const onPath = pathEdgeSet.has(e.source.id + "::" + e.target.id);
              const isHover = hovered && (e.source.id === hovered || e.target.id === hovered);
              const isDim = (selected && !onPath) || (hovered && !isHover && !selected);
              const stroke = onPath || isHover ? "var(--primary-bright)" : isDim ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.35)";
              const sw = onPath ? 2.2 : isHover ? 2 : isDim ? 0.5 : 1.2;
              const marker = onPath || isHover ? "url(#arrow-highlight)" : isDim ? "url(#arrow-dim)" : "url(#arrow)";
              return (
                <path key={"e" + i} d={bezierPathD(ep.x1, ep.y1, ep.x2, ep.y2)} fill="none"
                  stroke={stroke} strokeWidth={sw} markerEnd={marker}
                  data-on-path={onPath ? "true" : "false"}
                  style={{ pointerEvents: "none", transition: "stroke 0.2s ease, stroke-width 0.2s ease" }} />
              );
            })}

            {/* NODES */}
            {layout.nodes.map((n) => {
              const id = n.id;
              const label = labelOf(id);
              const score = mastery[id];
              const isWeak = weakSet.has(id) || (score != null ? score : 1) < 0.5;
              const depth = depths[id] != null ? depths[id] : 0;
              const onPath = pathSet.has(id);
              const isHover = hovered === id;
              const isFocused = focused === id;
              const isDim = selected && !onPath;
              const isActiveWeak = activeWeakTag === id;

              let fill, stroke, strokeW, textColor, fw, filter;
              if (onPath) { fill = "rgba(99,102,241,0.18)"; stroke = "var(--primary-bright)"; strokeW = 2; textColor = "var(--color-accent-text)"; fw = 700; filter = "none"; }
              else if (isWeak) { fill = "rgba(248,113,113,0.15)"; stroke = "var(--error)"; strokeW = 1.5; textColor = "var(--error)"; fw = 600; filter = "url(#glow-weak)"; }
              else { fill = "rgba(148,163,184,0.08)"; stroke = "rgba(148,163,184,0.25)"; strokeW = 1; textColor = "rgba(220,225,240,0.85)"; fw = 500; filter = "none"; }
              if (isHover && !onPath) { fill = isWeak ? "rgba(248,113,113,0.25)" : "rgba(99,145,255,0.12)"; stroke = isWeak ? "var(--error)" : "var(--primary-bright)"; strokeW = 2; }

              const w = pillWidth(label), h = PILL_H, x = n.x - w / 2, y = n.y - h / 2;
              const toggle = () => setSelected((cur) => (cur === id ? null : id));
              return (
                <g key={id} role="button" tabIndex={0}
                  aria-label={label + " mastery " + (score != null ? score.toFixed(2) : "unknown") + ", depth " + depth}
                  data-mastery={score != null ? score.toFixed(2) : ""}
                  data-weak={isWeak ? "true" : "false"}
                  data-on-path={onPath ? "true" : "false"}
                  data-active-weak={isActiveWeak ? "true" : "false"}
                  onClick={toggle}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } }}
                  onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)}
                  onFocus={() => setFocused(id)} onBlur={() => setFocused(null)}
                  style={{ cursor: "pointer", opacity: isDim ? 0.18 : 1, transition: "opacity 0.2s ease" }}
                  filter={filter}
                >
                  <rect x={x} y={y} width={w} height={h} rx={PILL_RX} fill={fill} stroke={stroke} strokeWidth={strokeW} style={{ transition: "fill 0.2s ease, stroke 0.2s ease" }} />
                  {/* §9 focus ring: 2px accent, 2px offset, brand-colored (native outline isn't --color-accent) */}
                  {isFocused && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={PILL_RX + 3} fill="none" stroke="var(--color-accent)" strokeWidth={2} style={{ pointerEvents: "none" }} />}
                  {score != null && (
                    <text x={x + w + 8} y={n.y + 0.5} fontSize={9} fill="var(--color-accent-text)" fontFamily="var(--font-mono)" textAnchor="start" dominantBaseline="central" style={{ pointerEvents: "none" }}>{score.toFixed(2)}</text>
                  )}
                  <text x={n.x} y={n.y + 0.5} fontSize={11} fill={textColor} fontFamily="var(--font-mono)" fontWeight={fw} textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: "none", letterSpacing: "0.02em" }}>{label}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Chain readout — text sibling to the SVG (also readable by AT) */}
        {selected && (
          <div data-testid="chain-readout" style={{ marginTop: 12, padding: "10px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)" }}>
            <span style={{ color: "var(--color-accent-text)" }}>Prereq chain · {labelOf(selected)} (depth {depths[selected] != null ? depths[selected] : 0}):</span>{" "}
            {chain.map((t, i) => (<span key={t}>{i > 0 && <span style={{ color: "var(--text-muted)" }}> → </span>}{labelOf(t)}</span>))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
