import { useMemo } from "react";
import { motion } from "framer-motion";
import { TargetIcon } from "./Icons";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import { prereqPath, FALLBACK_GRAPH, labelOf } from "../lib/topicGraphLayout.js";
import { bandFor } from "../lib/recBand.js";
import { panelTransition } from "../lib/motion.js";

export default function WhyThisRec() {
  const { activeWeakTag, recommendations, cfUser, lcUser, user, modelUsed } = useAnalysisContext();
  const recs = useMemo(() => recommendations || [], [recommendations]);
  const top = recs[0];

  const isEstimate = modelUsed !== "graph_dkt";  // §8

  const provenance = useMemo(() => {
    if (!top) return null;
    // §7 item 4 (Phase 4d) forward-compat: server provenance wins if present.
    if (top.provenance) return top.provenance;
    const userRating = (cfUser && cfUser.rating) || (lcUser && lcUser.rating) || (user && user.rating) || 800;
    const trigger = activeWeakTag || (top.matched_topics && top.matched_topics[0]) || "implementation";
    const path = prereqPath(FALLBACK_GRAPH.edges, trigger);
    const band = bandFor(userRating);
    const next = recs[1];
    // Client-path recs carry `rating`, backend recs carry `difficulty`; either may
    // be missing (unrated problem, single rec). Only compute a margin when both are
    // real; otherwise null → the UI renders an em-dash instead of a fabricated gap.
    const diffOf = (r) => r?.rating ?? r?.difficulty;
    const margin = Number.isFinite(diffOf(top)) && Number.isFinite(diffOf(next))
      ? diffOf(top) - diffOf(next)
      : null;
    return { trigger_weak_tag: trigger, prereq_path: path, band: [band.lo, band.hi], margin_vs_next: margin };
  }, [top, activeWeakTag, cfUser, lcUser, user, recs]);

  if (!provenance) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={panelTransition} style={{ margin: 0 }}
    >
      <div className="card dash-whyrec" style={{ padding: 24 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
              <TargetIcon size={16} />
            </div>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Why this recommendation</div>
            {isEstimate && (
              <span data-testid="estimate-badge" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--warning)", background: "var(--warning-container)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "var(--radius-full)", padding: "3px 8px" }}>
                estimate · not graph-dkt
              </span>
            )}
          </div>
        </div>

        {/* Trigger tag line */}
        <div style={{ fontSize: 13, color: "var(--on-surface-variant)", marginBottom: 14, lineHeight: 1.6 }}>
          Targeting <span style={{ color: "var(--color-accent-text)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{labelOf(provenance.trigger_weak_tag)}</span>
          {" — your active weak topic. The problems below sit one rung above your frontier mastery on this branch of the prerequisite graph."}
        </div>

        {/* Prereq path breadcrumb */}
        <div style={{ marginBottom: 14 }}>
          <div className="label-caps" style={{ marginBottom: 6 }}>Prerequisite path</div>
          <div data-testid="whyrec-path" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
            {provenance.prereq_path.map((t, i) => (
              <span key={t + i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>→</span>}
                <span style={{
                  fontSize: 11, fontFamily: "var(--font-mono)",
                  padding: "3px 9px", borderRadius: "var(--radius-full)",
                  background: i === provenance.prereq_path.length - 1 ? "rgba(248,113,113,0.12)" : "var(--surface-2)",
                  border: "1px solid",
                  borderColor: i === provenance.prereq_path.length - 1 ? "var(--error)" : "var(--outline-variant)",
                  color: i === provenance.prereq_path.length - 1 ? "var(--error)" : "var(--color-accent-text)",
                  fontWeight: i === provenance.prereq_path.length - 1 ? 700 : 500,
                }}>{labelOf(t)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Band + margin */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px", padding: "10px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--outline-variant)" }}>
            <div className="label-caps" style={{ marginBottom: 4 }}>Difficulty band</div>
            <div data-testid="whyrec-band" style={{ fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--on-surface)", fontWeight: 600 }}>{provenance.band[0]} – {provenance.band[1]}</div>
          </div>
          <div style={{ flex: "1 1 200px", padding: "10px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--outline-variant)" }}>
            <div className="label-caps" style={{ marginBottom: 4 }}>Margin vs next rec</div>
            <div data-testid="whyrec-margin" style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, color: provenance.margin_vs_next != null && provenance.margin_vs_next >= 0 ? "var(--warning)" : "var(--success)" }}>
              {provenance.margin_vs_next != null ? (provenance.margin_vs_next >= 0 ? "+" : "") + provenance.margin_vs_next + " rd" : "—"}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
