import { useState } from "react";
import { motion } from "framer-motion";
import { InfoIcon } from "./Icons";

/*
  Model Insight panel — explains WHY a recommendation was made.
  No model badges: the recommender is purely rule-based
  (topic-mastery scores + prerequisite gating + difficulty banding).
*/

function getInsightExplanation(topicProfile) {
  if (!topicProfile || topicProfile.length === 0) {
    return null;
  }

  const weakTopics = topicProfile.filter((t) => t.acRate < 65);
  const topWeak = weakTopics.length > 0 ? weakTopics[0] : null;

  if (topWeak) {
    return {
      title: `Focus on ${topWeak.tag.replace(/_/g, " ")}`,
      body: `You have a ${topWeak.acRate}% AC rate on ${topWeak.tag.replace(/_/g, " ")} with ${topWeak.solved} solves in ${topWeak.attempts} attempts. The system identifies this as a priority area for improvement based on your submission history.`,
      color: "var(--error)",
    };
  }

  const lowest = [...topicProfile].sort((a, b) => a.acRate - b.acRate)[0];
  if (lowest) {
    return {
      title: `Strengthening ${lowest.tag.replace(/_/g, " ")}`,
      body: `With a ${lowest.acRate}% AC rate on ${lowest.tag.replace(/_/g, " ")}, continued practice here will yield the most rating improvement.`,
      color: "var(--warning)",
    };
  }

  return null;
}

export default function ModelInsight({ topicProfile }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const insight = getInsightExplanation(topicProfile || []);

  if (!insight) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      style={{ margin: 0 }}
    >
      <div className="card" style={{ padding: 24 }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isExpanded ? 16 : 0, cursor: "pointer" }}
        onClick={() => setIsExpanded((v) => !v)}
        role="button"
        aria-expanded={isExpanded}
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
            Insight
          </div>
        </div>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {isExpanded ? "Collapse" : "Expand"}
        </span>
      </div>

      {isExpanded && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: insight.color, fontWeight: 600, fontFamily: "var(--font-body)" }}>
              {insight.title}
            </span>
          </div>

          <p style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.7, fontFamily: "var(--font-body)", marginBottom: 16 }}>
            {insight.body}
          </p>

          <div style={{ padding: "12px 16px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
            Recommendations are generated from your submission history using topic mastery scores and prerequisite gating across a directed graph of 22+ algorithmic topics. Problems are filtered by difficulty band relative to your rating.
          </div>
        </div>
      )}
    </div>
    </motion.div>
  );
}
