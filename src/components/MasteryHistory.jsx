// Greenhouse Phase 4b — MasteryHistory dashboard section (spec §5.2 #6).
// Graph-DKT only: rule_based paths render a disabled card with a caption (§8 —
// rule-based mastery must never be presented as Graph-DKT output).
// Body is the retroactive weekly fused-mastery curve (from the analyze payload,
// no DB read): topic dropdown + interactive hover tooltips.
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ZapIcon } from "./Icons";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import { panelTransition } from "../lib/motion.js";
import { labelOf, FALLBACK_GRAPH } from "../lib/topicGraphLayout.js";
import TopicWeeklyChart from "./TopicWeeklyChart.jsx";

export default function MasteryHistory() {
  const { modelUsed, weakTags, masteryWeekly } = useAnalysisContext();
  const graphDkt = modelUsed === "graph_dkt";

  // Selection is stamped with the weekly payload identity so a new analysis
  // resets it without an effect (old selection never leaks across analyses).
  const [selection, setSelection] = useState({ weekly: null, topic: null });

  const topics = useMemo(
    () => FALLBACK_GRAPH.nodes.map((node) => node.id).sort((a, b) => labelOf(a).localeCompare(labelOf(b))),
    []
  );

  const defaultTopic = useMemo(() => {
    if (!masteryWeekly) return null;
    const hasData = (topic) => ["cf", "lc"].some((key) => (masteryWeekly[key]?.[topic]?.length ?? 0) > 0);
    const weakWithData = (weakTags || []).map((t) => t.tag).find(hasData);
    if (weakWithData) return weakWithData;
    return topics.find(hasData) || null;
  }, [masteryWeekly, weakTags, topics]);

  const selected = (selection.weekly === masteryWeekly ? selection.topic : null) ?? defaultTopic;

  const series = useMemo(() => {
    if (!masteryWeekly || !selected) return [];
    const out = [];
    for (const [label, key] of [["CF", "cf"], ["LC", "lc"]]) {
      const pts = masteryWeekly[key]?.[selected];
      if (pts && pts.length) {
        out.push({
          label,
          points: pts.map((p) => (p ? p.p : null)),
          weeks: pts.map((p) => (p ? p.week : null)),
        });
      }
    }
    return out;
  }, [masteryWeekly, selected]);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
      <div className="card dash-mastery" style={{ padding: 24 }}>
        <div className="dash-mastery-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
            <ZapIcon size={16} />
          </div>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Mastery history</div>
          {!graphDkt && (
            <span data-testid="mastery-disabled-badge" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--warning)", background: "var(--warning-container)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "var(--radius-full)", padding: "3px 8px" }}>
              estimate · not graph-dkt
            </span>
          )}
        </div>

        {!graphDkt ? (
          <p data-testid="mastery-disabled" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: 0 }}>
            Mastery history requires the Graph-DKT model — the rule-based estimate has no weekly curve.
          </p>
        ) : !masteryWeekly ? (
          <p data-testid="mastery-note" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: 0 }}>
            No weekly mastery data yet — run an analysis while Graph-DKT is loaded.
          </p>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <label htmlFor="mastery-topic" style={{ fontSize: 12, color: "var(--on-surface-variant)", fontFamily: "var(--font-mono)" }}>
                Topic
              </label>
              <select
                id="mastery-topic"
                data-testid="mastery-topic-select"
                value={selected || ""}
                onChange={(e) => setSelection({ weekly: masteryWeekly, topic: e.target.value })}
                style={{ background: "var(--surface-2)", color: "var(--on-surface)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-sm)", padding: "6px 10px", fontSize: 12, fontFamily: "var(--font-mono)" }}
              >
                {topics.map((topic) => (
                  <option key={topic} value={topic}>{labelOf(topic)}</option>
                ))}
              </select>
            </div>
            <TopicWeeklyChart
              topic={selected}
              weeks={series[0]?.weeks || []}
              series={series}
              interactive
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
