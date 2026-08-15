// Greenhouse Phase 3 — landing DAG centerpiece (spec §5.1, §3 lock 4, §9).
// Presentation mode: decorative-only (aria-hidden SVG + text caption), no mastery,
// no weak annotation, no hover, no click. Reuses the shared topicGraphLayout engine
// (real dagre layout, real pill-boundary bezier edges). Draw fires from one
// IntersectionObserver on the frame; CSS drives the depth-staggered reveal.
import { useState, useEffect, useRef } from "react";
import useGraphLayout from "../hooks/useGraphLayout.js";
import {
  getEdgeEndpoints, bezierPathD,
  pillWidth, labelOf, PILL_H, PILL_RX, ARROW_SIZE,
} from "../lib/topicGraphLayout.js";

// §9: the caption carries the meaning in text (SVG is aria-hidden).
const CAPTION =
  "The competitive-programming prerequisite graph — 29 topics, 39 directed edges, rooted at implementation. " +
  "Each arrow runs from a prerequisite to the topic that depends on it; your knowledge builds from the root " +
  "outward. This is the same graph CP Coach maps your submissions onto.";

export default function LandingDAG() {
  const frameRef = useRef(null);
  // Lazy init: environments without IntersectionObserver render the static final
  // frame (visible=true) instead of drawing on scroll. Browsers/tests (IO defined)
  // start hidden (data-anim="out") until the observer fires. `react-hooks/
  // set-state-in-effect` bans the synchronous setVisible(this guard — keep it out of the effect.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const { layout, depths } = useGraphLayout();

  // One IO on the frame → flip visible, disconnect. [] deps = observe once at mount.
  // CRITICAL: the frame wrapper renders on first paint (below), so frameRef.current is
  // set when this effect runs — observe() is NOT skipped. SVG content is gated on
  // layout-ready, NOT on visible, so tests can assert nodes before firing IO.
  useEffect(() => {
    const frame = frameRef.current;
    if (typeof IntersectionObserver === "undefined" || !frame) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } });
    }, { threshold: 0.14 });
    io.observe(frame);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={frameRef} className="ldag-frame" data-testid="dag-frame" data-anim={visible ? "in" : "out"}>
      <p data-testid="dag-caption" className="ldag-caption" style={{
        maxWidth: "64ch", fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.7,
        margin: "0 auto 20px", fontFamily: "var(--font-body)",
      }}>
        {CAPTION}
      </p>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <svg
          viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
          aria-hidden="true"
          style={{ minWidth: layout.svgWidth, height: "auto", display: "block", userSelect: "none" }}
        >
          <defs>
            <marker id="ldag-arrow" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE}
              refX={ARROW_SIZE - 1} refY={ARROW_SIZE / 2} orient="auto" markerUnits="userSpaceOnUse">
              <path d={`M0,1 L${ARROW_SIZE - 1},${ARROW_SIZE / 2} L0,${ARROW_SIZE - 1}`}
                fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" />
            </marker>
          </defs>
          {layout.edges.map((e, i) => {
            const ep = getEdgeEndpoints(e.source, e.target);
            // Edge depth = the deeper endpoint — edges appear with their dependent node.
            const d = Math.max(depths[e.source.id] ?? 0, depths[e.target.id] ?? 0);
            return (
              <path key={`ldedge-${i}`} className="ld-edge"
                d={bezierPathD(ep.x1, ep.y1, ep.x2, ep.y2)}
                pathLength={1} markerEnd="url(#ldag-arrow)"
                style={{ "--d": d }} />
            );
          })}
          {layout.nodes.map((n) => {
            const id = n.id;
            const label = labelOf(id);
            const depth = depths[id] ?? 0;
            const isRoot = id === "implementation";
            const w = pillWidth(label), h = PILL_H, x = n.x - w / 2, y = n.y - h / 2;
            return (
              <g key={id} className={`ld-node${isRoot ? " ld-root" : ""}`} style={{ "--d": depth }}>
                {/* ponytail: graph node/edge body colors are raw rgba literals — established
                    pattern without graph-viz tokens (§6 defines no graph-viz tokens, only
                    surface/accent/motion). The arrow marker uses --color-accent intentionally
                    (decorative indigo accent). Ceiling: if a later Greenhouse phase adds
                    graph-viz tokens, swap these rgba literals. */}
                <rect x={x} y={y} width={w} height={h} rx={PILL_RX}
                  fill="rgba(148,163,184,0.08)" stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
                <text x={n.x} y={n.y + 0.5} fontSize={11} fill="rgba(220,225,240,0.85)"
                  fontFamily="var(--font-mono)" fontWeight={500}
                  textAnchor="middle" dominantBaseline="central" style={{ letterSpacing: "0.02em" }}>
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}