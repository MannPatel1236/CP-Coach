import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { InfoIcon } from "./Icons";
import { getLayout, FALLBACK_GRAPH, pillWidth, getEdgeEndpoints, bezierPathD, fetchTopicGraph, PILL_H, PILL_RX, ARROW_SIZE } from "../lib/topicGraphLayout.js";

export default function TopicGraphViz({ weakTags = [] }) {
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { nodes, edges, fromFallback } = await fetchTopicGraph();
      if (cancelled) return;
      setGraphData(fromFallback ? FALLBACK_GRAPH : { nodes, edges });
    })();
    return () => { cancelled = true; };
  }, []);

  const weakSet = useMemo(() => new Set(weakTags.map((t) => t.tag)), [weakTags]);

  // Track which nodes are orphans (no edges)
  const orphanSet = useMemo(() => {
    if (!graphData) return new Set();
    const edgeNodes = new Set();
    (graphData.edges || []).forEach((e) => {
      edgeNodes.add(e.source);
      edgeNodes.add(e.target);
    });
    const orphans = new Set();
    (graphData.nodes || []).forEach((n) => {
      const id = n.id || n;
      if (!edgeNodes.has(id)) orphans.add(id);
    });
    return orphans;
  }, [graphData]);

  const [{ nodes, edges, svgWidth, svgHeight }, setGraphLayout] = useState({
    nodes: [],
    edges: [],
    svgWidth: 1000,
    svgHeight: 620,
  });

  useEffect(() => {
    let cancelled = false;
    if (!graphData) return;
    (async () => {
      const { positions, svgWidth, svgHeight } = await getLayout(
        graphData.edges || [],
        graphData.nodes || []
      );
      if (cancelled) return;

      const processedNodes = (graphData.nodes || []).map((n) => {
        const id = n.id || n;
        const pos = positions[id] || { x: 500, y: 310 };
        return { ...n, id, x: pos.x, y: pos.y };
      });

      const processedEdges = (graphData.edges || [])
        .map((e) => {
          const src = processedNodes.find((n) => n.id === e.source);
          const tgt = processedNodes.find((n) => n.id === e.target);
          return src && tgt ? { ...e, source: src, target: tgt } : null;
        })
        .filter(Boolean);

      setGraphLayout({ nodes: processedNodes, edges: processedEdges, svgWidth, svgHeight });
    })();
    return () => { cancelled = true; };
  }, [graphData]);

  const connectedToHovered = useMemo(() => {
    const set = new Set();
    if (hovered) {
      for (const e of edges) {
        if (e.source.id === hovered || e.target.id === hovered) {
          set.add(e.source.id);
          set.add(e.target.id);
        }
      }
    }
    return set;
  }, [hovered, edges]);

  if (!graphData) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{ margin: 0 }}
    >
      <div className="card" style={{ padding: 24 }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, cursor: "pointer" }}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
              borderRadius: "var(--radius-sm)",
              width: 32, height: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--on-primary)", flexShrink: 0,
            }}
          >
            <InfoIcon size={16} />
          </div>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>
            Topic Prerequisite Graph
          </div>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {expanded ? "Collapse" : "Expand"}
        </span>
      </div>

      {expanded && (
        <>
          <div style={{ fontSize: 12, color: "var(--on-surface-variant)", lineHeight: 1.6, fontFamily: "var(--font-body)", marginBottom: 12 }}>
            Arrows show prerequisites (A → B means A is required before B). <span style={{ color: "var(--error)" }}>Red nodes</span> are your weak areas. Hover to highlight connections.
          </div>

          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: "0 -8px", padding: "0 8px" }}>
<svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ minWidth: svgWidth, height: "auto", userSelect: "none", display: "block" }}>
            <defs>
              {/* Glow filter for weak nodes */}
              <filter id="glow-weak" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feFlood floodColor="var(--error)" floodOpacity="0.35" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="colored-blur" />
                <feMerge>
                  <feMergeNode in="colored-blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Glow filter for hovered nodes */}
              <filter id="glow-hover" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feFlood floodColor="var(--primary-bright)" floodOpacity="0.3" result="color" />
                <feComposite in="color" in2="blur" operator="in" result="colored-blur" />
                <feMerge>
                  <feMergeNode in="colored-blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              {/* Arrow markers */}
              <marker id="arrow" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE - 1} refY={ARROW_SIZE / 2} orient="auto" markerUnits="userSpaceOnUse">
                <path d={`M0,1 L${ARROW_SIZE - 1},${ARROW_SIZE / 2} L0,${ARROW_SIZE - 1}`} fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
              </marker>
              <marker id="arrow-dim" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE - 1} refY={ARROW_SIZE / 2} orient="auto" markerUnits="userSpaceOnUse">
                <path d={`M0,1 L${ARROW_SIZE - 1},${ARROW_SIZE / 2} L0,${ARROW_SIZE - 1}`} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1.5" strokeLinejoin="round" />
              </marker>
              <marker id="arrow-highlight" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE - 1} refY={ARROW_SIZE / 2} orient="auto" markerUnits="userSpaceOnUse">
                <path d={`M0,1 L${ARROW_SIZE - 1},${ARROW_SIZE / 2} L0,${ARROW_SIZE - 1}`} fill="none" stroke="var(--primary-bright)" strokeWidth="1.5" strokeLinejoin="round" />
              </marker>
            </defs>

            {/* ---- LEGEND (top-right, inside SVG) ---- */}
            <g transform={`translate(${svgWidth - 330}, 10)`}>
              {/* Weak topic badge */}
              <rect x={0} y={0} width={72} height={20} rx={10} fill="rgba(248,113,113,0.15)" stroke="var(--error)" strokeWidth={1.2} />
              <text x={36} y={10} fontSize={9} fill="var(--error)" fontFamily="var(--font-body)" fontWeight={600} textAnchor="middle" dominantBaseline="central">
                Weak Topic
              </text>
              {/* Normal topic badge */}
              <rect x={80} y={0} width={78} height={20} rx={10} fill="rgba(148,163,184,0.08)" stroke="rgba(148,163,184,0.3)" strokeWidth={1} />
              <text x={119} y={10} fontSize={9} fill="rgba(220,225,240,0.7)" fontFamily="var(--font-body)" fontWeight={500} textAnchor="middle" dominantBaseline="central">
                Normal Topic
              </text>
              {/* Orphan topic badge */}
              <rect x={166} y={0} width={64} height={20} rx={10} fill="rgba(148,163,184,0.04)" stroke="rgba(148,163,184,0.15)" strokeWidth={1} strokeDasharray="3 2" />
              <text x={198} y={10} fontSize={9} fill="rgba(220,225,240,0.4)" fontFamily="var(--font-body)" fontWeight={500} textAnchor="middle" dominantBaseline="central">
                Standalone
              </text>
              {/* Vertical Divider */}
              <line x1={242} y1={2} x2={242} y2={18} stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
              {/* Arrow legend relationship */}
              <line x1={254} y1={10} x2={272} y2={10} stroke="rgba(148,163,184,0.5)" strokeWidth={1.2} />
              <path d="M270,7 L276,10 L270,13" fill="none" stroke="rgba(148,163,184,0.5)" strokeWidth={1.2} strokeLinejoin="round" />
              <text x={282} y={10} fontSize={9} fill="rgba(220,225,240,0.5)" fontFamily="var(--font-body)" fontWeight={500} dominantBaseline="central">
                Prereq
              </text>
            </g>

            {/* ---- EDGES ---- */}
            {edges.map((e, i) => {
              const { x1, y1, x2, y2 } = getEdgeEndpoints(e.source, e.target);
              const isEdgeHighlighted = hovered && (e.source.id === hovered || e.target.id === hovered);
              const isDim = hovered && !isEdgeHighlighted;
              const pathD = bezierPathD(x1, y1, x2, y2);
              return (
                <path
                  key={`edge-${i}`}
                  d={pathD}
                  fill="none"
                  stroke={isEdgeHighlighted ? "var(--primary-bright)" : isDim ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.35)"}
                  strokeWidth={isEdgeHighlighted ? 2 : isDim ? 0.5 : 1.2}
                  markerEnd={isDim ? "url(#arrow-dim)" : isEdgeHighlighted ? "url(#arrow-highlight)" : "url(#arrow)"}
                  style={{
                    pointerEvents: "none",
                    transition: "stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease",
                  }}
                />
              );
            })}

            {/* ---- NODES ---- */}
            {nodes.map((n) => {
              const isWeak = weakSet.has(n.id);
              const isOrphan = orphanSet.has(n.id);
              const isHovered = hovered === n.id;
              const isConnected = hovered ? connectedToHovered.has(n.id) : true;
              const isDimmed = hovered && !isConnected && !isHovered;

              const labelText = n.id.replace(/_/g, " ");
              const w = pillWidth(labelText);
              const h = PILL_H;
              const x = n.x - w / 2;
              const y = n.y - h / 2;

              // Dynamic styling
              let fillColor, strokeColor, strokeW, textColor, fontWeight, filterAttr;

              if (isWeak) {
                fillColor = "rgba(248,113,113,0.15)";
                strokeColor = "var(--error)";
                strokeW = 1.5;
                textColor = "var(--error)";
                fontWeight = 600;
                filterAttr = "url(#glow-weak)";
              } else if (isOrphan) {
                fillColor = "rgba(148,163,184,0.04)";
                strokeColor = "rgba(148,163,184,0.15)";
                strokeW = 1;
                textColor = "rgba(220,225,240,0.45)";
                fontWeight = 400;
                filterAttr = "none";
              } else {
                fillColor = "rgba(148,163,184,0.08)";
                strokeColor = "rgba(148,163,184,0.25)";
                strokeW = 1;
                textColor = "rgba(220,225,240,0.85)";
                fontWeight = 500;
                filterAttr = "none";
              }

              // Hover overrides
              if (isHovered) {
                fillColor = isWeak ? "rgba(248,113,113,0.25)" : "rgba(99,145,255,0.12)";
                strokeColor = isWeak ? "var(--error)" : "var(--primary-bright)";
                strokeW = 2;
                textColor = isWeak ? "var(--error)" : "var(--primary-bright)";
                fontWeight = 700;
                filterAttr = isWeak ? "url(#glow-weak)" : "url(#glow-hover)";
              }

              // Connected-to-hovered highlight
              if (hovered && !isHovered && isConnected) {
                strokeColor = isWeak ? "var(--error)" : "var(--primary-bright)";
                strokeW = 1.5;
                textColor = isWeak ? "var(--error)" : "rgba(220,225,240,0.95)";
                fontWeight = isWeak ? 600 : 600;
              }

              return (
                <g
                  key={n.id}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    cursor: "pointer",
                    transition: "opacity 0.2s ease",
                    opacity: isDimmed ? 0.15 : 1,
                  }}
                  filter={filterAttr}
                >
                  {/* Pill background */}
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={PILL_RX}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={strokeW}
                    strokeDasharray={isOrphan && !isHovered ? "4 3" : "none"}
                    style={{
                      transition: "fill 0.2s ease, stroke 0.2s ease, stroke-width 0.15s ease",
                    }}
                  />
                  {/* Label text */}
                  <text
                    x={n.x}
                    y={n.y + 0.5}
                    fontSize={11}
                    fill={textColor}
                    fontFamily="var(--font-mono)"
                    fontWeight={fontWeight}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      pointerEvents: "none",
                      transition: "fill 0.2s ease",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {labelText}
                  </text>
                </g>
              );
            })}
          </svg>
          </div>
        </>
      )}
    </div>
    </motion.div>
  );
}
