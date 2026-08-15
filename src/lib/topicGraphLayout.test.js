import { describe, it, expect } from "vitest";
import {
  FALLBACK_GRAPH, getLayout, pillWidth, labelOf, getEdgeEndpoints, bezierPathD,
  prereqPath, topicDepths, fetchTopicGraph,
} from "./topicGraphLayout.js";

const EDGES = FALLBACK_GRAPH.edges;

describe("topicGraphLayout — FALLBACK_GRAPH", () => {
  it("is the 29-node / 39-edge prerequisite DAG", () => {
    expect(FALLBACK_GRAPH.nodes.length).toBe(29);
    expect(FALLBACK_GRAPH.edges.length).toBe(39);
    expect(FALLBACK_GRAPH.nodes[0].id).toBe("implementation");
  });
});

describe("topicGraphLayout — getLayout", () => {
  it("returns finite positions for every node and positive svg dims", async () => {
    const { positions, svgWidth, svgHeight } = await getLayout(EDGES, FALLBACK_GRAPH.nodes);
    expect(svgWidth).toBeGreaterThan(0);
    expect(svgHeight).toBeGreaterThan(0);
    for (const n of FALLBACK_GRAPH.nodes) {
      const p = positions[n.id];
      expect(p).toBeDefined();
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe("topicGraphLayout — geometry helpers", () => {
  it("pillWidth grows with label length", () => {
    expect(pillWidth("math")).toBeLessThan(pillWidth("constructive_algorithms"));
  });
  it("bezierPathD returns an SVG path starting with M and using C", () => {
    const d = bezierPathD(10, 20, 200, 40);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("C ");
  });
  it("labelOf converts snake_case ids to display labels", () => {
    expect(labelOf("binary_search")).toBe("binary search");
    expect(labelOf("implementation")).toBe("implementation");
  });
  it("getEdgeEndpoints returns two finite points", () => {
    const src = { id: "implementation", x: 100, y: 100 };
    const tgt = { id: "math", x: 300, y: 100 };
    const { x1, y1, x2, y2 } = getEdgeEndpoints(src, tgt);
    expect(Number.isFinite(x1) && Number.isFinite(y1)).toBe(true);
    expect(Number.isFinite(x2) && Number.isFinite(y2)).toBe(true);
  });
});

describe("topicGraphLayout — prereq path (BFS) + topic depths (longest path)", () => {
  it("prereqPath starts at implementation and ends at target", () => {
    const path = prereqPath(EDGES, "dp");
    expect(path[0]).toBe("implementation");
    expect(path[path.length - 1]).toBe("dp");
  });

  it("prereqPath is a real chain: every consecutive pair is a prerequisite edge", () => {
    const path = prereqPath(EDGES, "combinatorics");
    for (let i = 0; i < path.length - 1; i++) {
      const has = EDGES.some(e => e.source === path[i] && e.target === path[i + 1]);
      expect(has).toBe(true);
    }
  });

  it("prereqPath('combinatorics') is the unique shortest path implementation→number_theory→combinatorics", () => {
    // number_theory is the ONLY prerequisite of combinatorics in FALLBACK_GRAPH,
    // and number_theory's only prerequisite-bearing parent toward the root is math,
    // and math→implementation is direct — so the path is unique and length 4.
    expect(prereqPath(EDGES, "combinatorics")).toEqual([
      "implementation", "math", "number_theory", "combinatorics",
    ]);
  });

  it("prereqPath('implementation') returns [implementation] (root has no prereqs)", () => {
    expect(prereqPath(EDGES, "implementation")).toEqual(["implementation"]);
  });

  it("prereqPath for an unknown target returns [implementation] (graceful root fallback)", () => {
    expect(prereqPath(EDGES, "nonexistent_topic")).toEqual(["implementation"]);
  });

  it("topicDepths sets root depth 0 and every node reachable from root is an integer ≥0", () => {
    const depths = topicDepths(EDGES, "implementation");
    expect(depths.implementation).toBe(0);
    for (const n of FALLBACK_GRAPH.nodes) {
      if (n.id === "implementation") continue;
      if (n.id in depths) {
        expect(Number.isInteger(depths[n.id])).toBe(true);
        expect(depths[n.id]).toBeGreaterThanOrEqual(0);
      }
    }
    // dp is several hops deep (depth 6 per CLAUDE.md per-topic table, longest path)
    expect(depths.dp).toBe(6);
  });
});

describe("topicGraphLayout — fetchTopicGraph fallback", () => {
  it("resolves to FALLBACK_GRAPH + fromFallback=true when /api/graph is unreachable", async () => {
    // No network in unit test → fetch rejects → fallback path. Point VITE_API_URL at a
    // definitely-bad host so the fetch is attempted (and fails) rather than skipped.
    const prev = import.meta.env.VITE_API_URL;
    import.meta.env.VITE_API_URL = "https://invalid.invalid.invalid";
    try {
      const res = await fetchTopicGraph();
      expect(res.fromFallback).toBe(true);
      expect(res.nodes.length).toBe(29);
      expect(res.edges.length).toBe(39);
    } finally {
      import.meta.env.VITE_API_URL = prev;
    }
  });
});
