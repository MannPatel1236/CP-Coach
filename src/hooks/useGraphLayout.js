import { useState, useEffect, useMemo } from "react";
import { fetchTopicGraph, getLayout, topicDepths } from "../lib/topicGraphLayout.js";

// Shared graph-fetch + dagre-layout state, used by SkillFrontier (dashboard) and
// LandingDAG (landing). Both mount the same fetch + layout + depth effects;
// extracted so the triples can never drift (ponytail: pull the identical effects up).
export default function useGraphLayout() {
  const [graphData, setGraphData] = useState(null);   // { nodes, edges, fromFallback }
  const [layout, setLayout] = useState({ nodes: [], edges: [], svgWidth: 1000, svgHeight: 620 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const g = await fetchTopicGraph();
      if (cancelled) return;
      setGraphData(g);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!graphData) return;
    (async () => {
      const { positions, svgWidth, svgHeight } = await getLayout(graphData.edges, graphData.nodes);
      if (cancelled) return;
      const nodes = (graphData.nodes || []).map((n) => {
        const id = n.id || n;
        const pos = positions[id] || { x: 500, y: 310 };
        return { ...n, id, x: pos.x, y: pos.y };
      });
      const edges = (graphData.edges || [])
        .map((e) => {
          const src = nodes.find((n) => n.id === e.source);
          const tgt = nodes.find((n) => n.id === e.target);
          return src && tgt ? { source: src, target: tgt } : null;
        })
        .filter(Boolean);
      setLayout({ nodes, edges, svgWidth, svgHeight });
    })();
    return () => { cancelled = true; };
  }, [graphData]);

  // ponytail: topicDepths is O(V*E) memoized, trivial at 29 nodes; lifted here so both
  // consumers share one depth computation instead of recomputing it independently.
  const depths = useMemo(
    () => topicDepths((graphData && graphData.edges) || [], "implementation"),
    [graphData]
  );

  return { graphData, layout, depths };
}
