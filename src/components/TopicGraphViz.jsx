import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { InfoIcon } from "./Icons";

// Lazily loaded dagre (~200 KB). Only downloads when the graph is visible.
const dagrePromise = import("dagre").then((mod) => mod.default || mod);

const PILL_H = 28;
const PILL_RX = 14;
const CHAR_W = 6.8;
const PAD_X = 14;
const ARROW_SIZE = 10;

// ------------------------------------------------------------------
//  Difficulty rank for orphan nodes — place them at an appropriate
//  level in the graph rather than dumping them all together.
//  Lower rank = easier / more foundational, higher = harder.
// ------------------------------------------------------------------
const ORPHAN_DIFFICULTY_RANK = {
  brute_force: 0,       // very beginner
  strings: 1,           // beginner
  hashing: 1,           // beginner
  bitmasks: 2,          // intermediate
  divide_and_conquer: 2, // intermediate
  geometry: 3,          // advanced
  flows: 4,             // very advanced
};

// ------------------------------------------------------------------
//  Helper: compute hierarchical DAG layout using dagre.
//  Dagre uses the Sugiyama algorithm for crossing minimization,
//  producing a clean left-to-right DAG with minimal edge crossings.
//  Positions are normalized to fit within the SVG viewport.
// ------------------------------------------------------------------
async function getLayout(eds, rawNodes) {
  const dagre = await dagrePromise;
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 55, ranksep: 130, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes = Array.isArray(rawNodes) ? rawNodes : [];
  const edgeNodeIds = new Set();
  eds.forEach((e) => {
    edgeNodeIds.add(e.source);
    edgeNodeIds.add(e.target);
  });

  // Separate connected vs orphan nodes
  const connectedNodes = [];
  const orphanNodes = [];
  nodes.forEach((n) => {
    const id = n.id || n;
    if (edgeNodeIds.has(id)) {
      connectedNodes.push(id);
    } else {
      orphanNodes.push(id);
    }
  });

  // Map label sizes for all nodes to calculate bounds
  const nodePillWidths = {};
  nodes.forEach((n) => {
    const id = n.id || n;
    const label = id.replace(/_/g, " ");
    nodePillWidths[id] = label.length * CHAR_W + PAD_X * 2;
  });

  // Add connected nodes to dagre
  connectedNodes.forEach((id) => {
    g.setNode(id, { width: nodePillWidths[id] + 20, height: PILL_H + 10 });
  });

  eds.forEach((e) => {
    g.setEdge(e.source, e.target);
  });

  dagre.layout(g);

  // Collect initial dagre coordinates
  const preScalePositions = {};
  let connMinX = Infinity, connMaxX = -Infinity;
  let connMinY = Infinity, connMaxY = -Infinity;
  
  g.nodes().forEach((id) => {
    const node = g.node(id);
    if (node) {
      preScalePositions[id] = { x: node.x, y: node.y };
      connMinX = Math.min(connMinX, node.x);
      connMaxX = Math.max(connMaxX, node.x);
      connMinY = Math.min(connMinY, node.y);
      connMaxY = Math.max(connMaxY, node.y);
    }
  });

  // Fallbacks if no connected nodes
  if (connMinX === Infinity) {
    connMinX = 100; connMaxX = 800;
    connMinY = 200; connMaxY = 400;
  }
  const connXRange = connMaxX - connMinX || 1;

  // Place orphans relative to main graph bounds *before* scaling
  if (orphanNodes.length > 0) {
    const maxRank = 4;
    const orphansByRank = {};
    orphanNodes.forEach((id) => {
      const rank = ORPHAN_DIFFICULTY_RANK[id] ?? 2;
      if (!orphansByRank[rank]) orphansByRank[rank] = [];
      orphansByRank[rank].push(id);
    });

    Object.entries(orphansByRank).forEach(([rank, ids]) => {
      const rankRatio = Number(rank) / maxRank;
      const baseX = connMinX + rankRatio * connXRange;

      ids.forEach((id, i) => {
        const spacing = 45;
        const direction = i % 2 === 0 ? 1 : -1;
        const offset = Math.ceil((i + 1) / 2) * spacing;
        const targetY = direction > 0 ? connMaxY + offset : connMinY - offset;
        preScalePositions[id] = { x: baseX, y: targetY };
      });
    });
  }

  // Calculate actual bounding box of the physical pills in raw coordinates
  let minPillX = Infinity, maxPillX = -Infinity;
  let minPillY = Infinity, maxPillY = -Infinity;

  Object.entries(preScalePositions).forEach(([id, pos]) => {
    const halfW = nodePillWidths[id] / 2;
    const halfH = PILL_H / 2;
    minPillX = Math.min(minPillX, pos.x - halfW);
    maxPillX = Math.max(maxPillX, pos.x + halfW);
    minPillY = Math.min(minPillY, pos.y - halfH);
    maxPillY = Math.max(maxPillY, pos.y + halfH);
  });

  // Normalize and scale coordinates to fit bounds with padding
  const padTop = 50;  // room for legend
  const padBottom = 20;
  const padLeft = 20;
  const padRight = 20;

  const graphW = maxPillX - minPillX || 1;
  const graphH = maxPillY - minPillY || 1;

  const svgWidth = Math.max(1000, graphW + padLeft + padRight);
  const svgHeight = graphH + padTop + padBottom;

  // Center/Align within the SVG space
  const shiftX = padLeft - minPillX;
  const shiftY = padTop - minPillY;

  // Center horizontally if the graph is smaller than the 1000px minimum width
  const extraWidth = svgWidth - (graphW + padLeft + padRight);
  const finalShiftX = shiftX + extraWidth / 2;

  const finalPositions = {};
  Object.entries(preScalePositions).forEach(([id, pos]) => {
    finalPositions[id] = {
      x: pos.x + finalShiftX,
      y: pos.y + shiftY,
    };
  });

  return { positions: finalPositions, svgWidth, svgHeight };
}

// Hardcoded fallback graph matching the full topic graph used elsewhere.
const FALLBACK_GRAPH = {
  nodes: [
    { id: "implementation", label: "implementation" },
    { id: "math", label: "math" },
    { id: "greedy", label: "greedy" },
    { id: "constructive_algorithms", label: "constructive_algorithms" },
    { id: "binary_search", label: "binary_search" },
    { id: "two_pointers", label: "two_pointers" },
    { id: "sortings", label: "sortings" },
    { id: "strings", label: "strings" },
    { id: "number_theory", label: "number_theory" },
    { id: "combinatorics", label: "combinatorics" },
    { id: "dfs_and_similar", label: "dfs_and_similar" },
    { id: "graphs", label: "graphs" },
    { id: "trees", label: "trees" },
    { id: "dp", label: "dp" },
    { id: "dp_on_trees", label: "dp_on_trees" },
    { id: "data_structures", label: "data_structures" },
    { id: "bitmasks", label: "bitmasks" },
    { id: "divide_and_conquer", label: "divide_and_conquer" },
    { id: "hashing", label: "hashing" },
    { id: "geometry", label: "geometry" },
    { id: "flows", label: "flows" },
    { id: "brute_force", label: "brute_force" },
      ],
  edges: [
    { source: "implementation", target: "math" },
    { source: "math", target: "greedy" },
    { source: "math", target: "constructive_algorithms" },
    { source: "greedy", target: "binary_search" },
    { source: "binary_search", target: "data_structures" },
    { source: "data_structures", target: "trees" },
    { source: "data_structures", target: "graphs" },
    { source: "trees", target: "dfs_and_similar" },
    { source: "graphs", target: "dfs_and_similar" },
    { source: "dfs_and_similar", target: "dp" },
    { source: "dp", target: "dp_on_trees" },
    { source: "greedy", target: "dp" },
    { source: "math", target: "number_theory" },
    { source: "number_theory", target: "combinatorics" },
    { source: "binary_search", target: "sortings" },
    { source: "sortings", target: "data_structures" },
    { source: "math", target: "two_pointers" },
    { source: "two_pointers", target: "binary_search" },
  ],
};

// Pill width for a given label
function pillWidth(label) {
  return label.length * CHAR_W + PAD_X * 2;
}

export default function TopicGraphViz({ weakTags = [] }) {
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [graphData, setGraphData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base = import.meta.env.VITE_API_URL || "";
        const res = await fetch(`${base}/api/graph`, {
          signal: AbortSignal.timeout(5000),
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setGraphData(data);
        } else {
          setGraphData(FALLBACK_GRAPH);
        }
      } catch {
        if (cancelled) return;
        setGraphData(FALLBACK_GRAPH);
      }
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

  // Compute edge endpoints that stop at the pill boundary
  function getEdgeEndpoints(src, tgt) {
    const srcLabel = src.id.replace(/_/g, " ");
    const tgtLabel = tgt.id.replace(/_/g, " ");
    const srcW = pillWidth(srcLabel) / 2;
    const tgtW = pillWidth(tgtLabel) / 2;
    const srcH = PILL_H / 2;
    const tgtH = PILL_H / 2;

    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const angle = Math.atan2(dy, dx);

    // For mostly-horizontal layout, exit from the right side of source pill
    // and enter from the left side of target pill
    const absCos = Math.abs(Math.cos(angle));
    const absSin = Math.abs(Math.sin(angle));

    let x1, y1, x2, y2;

    // Source exit point
    if (absCos * srcH > absSin * srcW) {
      // Exit horizontally
      const sign = Math.sign(dx) || 1;
      x1 = src.x + sign * (srcW + 2);
      y1 = src.y + (dy / (Math.abs(dx) || 1)) * (srcW + 2);
      y1 = Math.max(src.y - srcH, Math.min(src.y + srcH, y1));
    } else {
      // Exit vertically
      const sign = Math.sign(dy) || 1;
      y1 = src.y + sign * (srcH + 2);
      x1 = src.x + (dx / (Math.abs(dy) || 1)) * (srcH + 2);
      x1 = Math.max(src.x - srcW, Math.min(src.x + srcW, x1));
    }

    // Target entry point
    if (absCos * tgtH > absSin * tgtW) {
      const sign = Math.sign(dx) || 1;
      x2 = tgt.x - sign * (tgtW + 2);
      y2 = tgt.y - (dy / (Math.abs(dx) || 1)) * (tgtW + 2);
      y2 = Math.max(tgt.y - tgtH, Math.min(tgt.y + tgtH, y2));
    } else {
      const sign = Math.sign(dy) || 1;
      y2 = tgt.y - sign * (tgtH + 2);
      x2 = tgt.x - (dx / (Math.abs(dy) || 1)) * (tgtH + 2);
      x2 = Math.max(tgt.x - tgtW, Math.min(tgt.x + tgtW, x2));
    }

    return { x1, y1, x2, y2 };
  }

  // Cubic Bezier edge path for smooth, horizontal-flowing edges.
  function bezierPathD(x1, y1, x2, y2) {
    const dist = x2 - x1;
    const cp1x = x1 + dist * 0.4;
    const cp2x = x2 - dist * 0.4;
    const safeCp1x = Math.min(cp1x, (x1 + x2) / 2);
    const safeCp2x = Math.max(cp2x, (x1 + x2) / 2);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} C ${safeCp1x.toFixed(2)} ${y1.toFixed(2)}, ${safeCp2x.toFixed(2)} ${y2.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

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
