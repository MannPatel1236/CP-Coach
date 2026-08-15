// Pure DAG layout + prerequisite-graph math for the CP topic graph.
// Three consumers: SkillFrontier + WhyThisRec (dashboard, Phase 2) and
// LandingDAG (landing presentation mode, Phase 3 — §5.1 "real dagre layout").
// Extracted so they share one engine, NOT to abstract a viz framework
// (ponytail: move-to-lib).

// Lazily loaded dagre (~200 KB). Only downloads when a graph is visible.
const dagrePromise = import("dagre").then((mod) => mod.default || mod);

// Canonical snake_case id → display label. Shared by SkillFrontier, LandingDAG,
// WhyThisRec, and the layout engine itself (getLayout / getEdgeEndpoints).
export function labelOf(id) {
  return String(id).replace(/_/g, " ");
}

export const PILL_H = 28;
export const PILL_RX = 14;
export const CHAR_W = 6.8;
export const PAD_X = 14;
export const ARROW_SIZE = 10;

// Difficulty rank for orphan nodes — place them at an appropriate level
// in the graph rather than dumping them together. After the 22→29 / 18→39
// expansion, the only orphan is the root `implementation` (rank 0, far left).
export const ORPHAN_DIFFICULTY_RANK = {
  implementation: 0, // root — far left, everything else flows from here
};

// Hardcoded fallback graph matching the full topic graph used elsewhere
// (seeded from backend/db/schema.sql; authoritative for client-side path math
// in WhyThisRec — see prereqPath). Static DATA, not secrets (spec §8).
export const FALLBACK_GRAPH = {
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
    { id: "prefix_sum", label: "prefix_sum" },
    { id: "sliding_window", label: "sliding_window" },
    { id: "dsu", label: "dsu" },
    { id: "shortest_paths", label: "shortest_paths" },
    { id: "backtracking", label: "backtracking" },
    { id: "string_algorithms", label: "string_algorithms" },
    { id: "matrices", label: "matrices" },
  ],
  edges: [
    { source: "implementation", target: "math" },
    { source: "implementation", target: "sortings" },
    { source: "implementation", target: "strings" },
    { source: "implementation", target: "brute_force" },
    { source: "implementation", target: "prefix_sum" },
    { source: "math", target: "greedy" },
    { source: "math", target: "number_theory" },
    { source: "math", target: "geometry" },
    { source: "math", target: "constructive_algorithms" },
    { source: "math", target: "bitmasks" },
    { source: "sortings", target: "binary_search" },
    { source: "sortings", target: "two_pointers" },
    { source: "sortings", target: "data_structures" },
    { source: "sortings", target: "greedy" },
    { source: "strings", target: "hashing" },
    { source: "two_pointers", target: "sliding_window" },
    { source: "binary_search", target: "data_structures" },
    { source: "binary_search", target: "divide_and_conquer" },
    { source: "number_theory", target: "combinatorics" },
    { source: "data_structures", target: "graphs" },
    { source: "data_structures", target: "trees" },
    { source: "data_structures", target: "dsu" },
    { source: "data_structures", target: "shortest_paths" },
    { source: "graphs", target: "dfs_and_similar" },
    { source: "graphs", target: "shortest_paths" },
    { source: "graphs", target: "flows" },
    { source: "graphs", target: "dsu" },
    { source: "trees", target: "dfs_and_similar" },
    { source: "trees", target: "dp_on_trees" },
    { source: "dfs_and_similar", target: "dp" },
    { source: "dfs_and_similar", target: "backtracking" },
    { source: "dfs_and_similar", target: "dp_on_trees" },
    { source: "dfs_and_similar", target: "flows" },
    { source: "greedy", target: "dp" },
    { source: "dp", target: "dp_on_trees" },
    { source: "dp", target: "string_algorithms" },
    { source: "dp", target: "matrices" },
    { source: "hashing", target: "string_algorithms" },
    { source: "brute_force", target: "backtracking" },
  ],
};

// Pill width for a given label (matches TopicGraphViz's original pillWidth).
export function pillWidth(label) {
  return label.length * CHAR_W + PAD_X * 2;
}

// Hierarchical DAG layout via dagre (Sugiyama, LR, crossing-minimized).
// Positions normalized to the SVG viewport. Lifted verbatim from TopicGraphViz
// so the refactor is a pure move (no behavior change).
export async function getLayout(eds, rawNodes) {
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

  const connectedNodes = [];
  const orphanNodes = [];
  nodes.forEach((n) => {
    const id = n.id || n;
    if (edgeNodeIds.has(id)) connectedNodes.push(id);
    else orphanNodes.push(id);
  });

  const nodePillWidths = {};
  nodes.forEach((n) => {
    const id = n.id || n;
    const label = labelOf(id);
    nodePillWidths[id] = pillWidth(label);
  });

  connectedNodes.forEach((id) => {
    g.setNode(id, { width: nodePillWidths[id] + 20, height: PILL_H + 10 });
  });
  eds.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  const preScalePositions = {};
  let connMinX = Infinity, connMaxX = -Infinity, connMinY = Infinity, connMaxY = -Infinity;
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
  if (connMinX === Infinity) { connMinX = 100; connMaxX = 800; connMinY = 200; connMaxY = 400; }
  const connXRange = connMaxX - connMinX || 1;

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

  let minPillX = Infinity, maxPillX = -Infinity, minPillY = Infinity, maxPillY = -Infinity;
  Object.entries(preScalePositions).forEach(([id, pos]) => {
    const halfW = nodePillWidths[id] / 2;
    const halfH = PILL_H / 2;
    minPillX = Math.min(minPillX, pos.x - halfW);
    maxPillX = Math.max(maxPillX, pos.x + halfW);
    minPillY = Math.min(minPillY, pos.y - halfH);
    maxPillY = Math.max(maxPillY, pos.y + halfH);
  });

  const padTop = 50, padBottom = 20, padLeft = 20, padRight = 20;
  const graphW = maxPillX - minPillX || 1;
  const graphH = maxPillY - minPillY || 1;
  const svgWidth = Math.max(1000, graphW + padLeft + padRight);
  const svgHeight = graphH + padTop + padBottom;
  const shiftX = padLeft - minPillX;
  const shiftY = padTop - minPillY;
  const extraWidth = svgWidth - (graphW + padLeft + padRight);
  const finalShiftX = shiftX + extraWidth / 2;

  const finalPositions = {};
  Object.entries(preScalePositions).forEach(([id, pos]) => {
    finalPositions[id] = { x: pos.x + finalShiftX, y: pos.y + shiftY };
  });

  return { positions: finalPositions, svgWidth, svgHeight };
}

// Compute edge endpoints that stop at the pill boundary (lifted from TopicGraphViz).
export function getEdgeEndpoints(src, tgt) {
  const srcLabel = labelOf(src.id);
  const tgtLabel = labelOf(tgt.id);
  const srcW = pillWidth(srcLabel) / 2;
  const tgtW = pillWidth(tgtLabel) / 2;
  const srcH = PILL_H / 2;
  const tgtH = PILL_H / 2;

  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const angle = Math.atan2(dy, dx);
  const absCos = Math.cos(angle) < 0 ? -Math.cos(angle) : Math.cos(angle);
  const absSin = Math.sin(angle) < 0 ? -Math.sin(angle) : Math.sin(angle);

  let x1, y1, x2, y2;

  if (absCos * srcH > absSin * srcW) {
    const sign = Math.sign(dx) || 1;
    x1 = src.x + sign * (srcW + 2);
    y1 = src.y + (dy / (Math.abs(dx) || 1)) * (srcW + 2);
    y1 = Math.max(src.y - srcH, Math.min(src.y + srcH, y1));
  } else {
    const sign = Math.sign(dy) || 1;
    y1 = src.y + sign * (srcH + 2);
    x1 = src.x + (dx / (Math.abs(dy) || 1)) * (srcH + 2);
    x1 = Math.max(src.x - srcW, Math.min(src.x + srcW, x1));
  }

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
export function bezierPathD(x1, y1, x2, y2) {
  const dist = x2 - x1;
  const cp1x = x1 + dist * 0.4;
  const cp2x = x2 - dist * 0.4;
  const safeCp1x = Math.min(cp1x, (x1 + x2) / 2);
  const safeCp2x = Math.max(cp2x, (x1 + x2) / 2);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} C ${safeCp1x.toFixed(2)} ${y1.toFixed(2)}, ${safeCp2x.toFixed(2)} ${y2.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// Live /api/graph with the 5s-timeout fallback to FALLBACK_GRAPH (spec §8).
// De-dupes an in-flight promise so SkillFrontier + LandingDAG never double-fetch.
let inflight = null;
export async function fetchTopicGraph() {
  const base = import.meta.env.VITE_API_URL || "";
  try {
    inflight ||= fetch(`${base}/api/graph`, { signal: AbortSignal.timeout(5000) })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("graph http " + res.status))))
      .finally(() => { inflight = null; });
    const data = await inflight;
    return { nodes: data.nodes || [], edges: data.edges || [], fromFallback: false };
  } catch {
    inflight = null;
    return { nodes: FALLBACK_GRAPH.nodes, edges: FALLBACK_GRAPH.edges, fromFallback: true };
  }
}

// Build target → [prerequisites] adjacency (parents of each topic).
function prereqAdjacency(edges) {
  const parents = {};
  for (const e of edges) {
    (parents[e.target] ||= []).push(e.source);
  }
  // Sort for deterministic BFS tie-breaking.
  for (const k of Object.keys(parents)) parents[k].sort();
  return parents;
}

// Shortest prerequisite chain from root → target, walking edges backward
// (target's prerequisites toward the root). Deterministic: BFS by hop count,
// alphabetically-tied. ponytail: BFS shortest path — O(V+E), fine for 29 nodes;
// upgrade to Dijkstra only if edge weights ever become non-unit.
export function prereqPath(edges, target, root = "implementation") {
  if (!target || target === root) return [root];
  const parents = prereqAdjacency(edges);
  if (!(target in parents)) return [root]; // unknown/orphan → graceful root fallback

  const prev = { [target]: null };
  const queue = [target];
  while (queue.length) {
    const node = queue.shift();
    if (node === root) break;
    for (const p of parents[node] || []) {
      if (!(p in prev)) {
        prev[p] = node;
        queue.push(p);
      }
    }
  }
  if (!(root in prev)) return [target]; // root unreachable → just the target
  const path = [];
  let cur = root;
  while (cur !== null) {
    path.push(cur);
    cur = prev[cur];
  }
  return path; // root → … → target
}

// Topic depth = length of the LONGEST path from root (prerequisite → dependent).
// This matches the documented per-topic depth table in CLAUDE.md (dp=6, graphs=4,
// etc.) that the SkillFrontier aria-label "depth {d}" surfaces. NOT BFS shortest
// (dp's shortest path is 3 via greedy, which would mislabel it). Assumes the graph
// is a DAG (spec: 29 nodes, 39 directed edges, single root, 0 orphans).
// ponytail: O(V*E) memoized DFS — 29*39 ≈ 1100 ops, trivial; upgrade to Kahn-based
// longest-path only if the graph grows past ~1k nodes.
export function topicDepths(edges, root = "implementation") {
  const parents = {};
  const all = new Set([root]);
  for (const e of edges) {
    (parents[e.target] ||= []).push(e.source);
    all.add(e.source);
    all.add(e.target);
  }
  const memo = { [root]: 0 };
  function depthOf(node) {
    if (node in memo) return memo[node];
    let maxd = -1;
    for (const p of parents[node] || []) {
      const d = depthOf(p);
      if (d > maxd) maxd = d;
    }
    memo[node] = maxd >= 0 ? maxd + 1 : 0;
    return memo[node];
  }
  for (const n of all) depthOf(n);
  return memo;
}
