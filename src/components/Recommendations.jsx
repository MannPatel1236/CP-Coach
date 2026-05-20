import { motion } from "framer-motion";
import { diffColor } from "../utils.js";
import { ExternalLinkIcon, BookIcon, CodeforcesIcon, LeetCodeIcon } from "./Icons";

const BASE_RECOMMEND_RATING = 800;
const RATING_STEP = 100;
const NORMAL_RANGE = 350;

function normalizeRec(p) {
  const isBackendFormat = p.problem_id !== undefined;
  
  if (isBackendFormat) {
    const isCF = p.problem_id.startsWith("cf-");
    const problemId = p.problem_id.replace(/^(cf-|lc-)/, "");
    const [contestId, index] = isCF 
      ? [problemId.slice(0, -1), problemId.slice(-1)]
      : [null, problemId];
    
    return {
      platform: p.platform || (isCF ? "cf" : "lc"),
      contestId,
      index,
      rating: p.difficulty,
      solvedCount: p.solve_count || 0,
      matchedTags: p.matched_topics || [],
      isStretch: p.is_stretch,
      name: p.name || "",
      url: p.url || "",
    };
  }
  
  return {
    platform: "cf",
    contestId: p.contestId,
    index: p.index,
    rating: p.rating,
    solvedCount: p.solvedCount || 0,
    matchedTags: p.matchedTags || [],
    isStretch: p.isStretch,
    name: p.name || "",
    url: p.url || "",
  };
}

export default function Recommendations({ recs, userRating, selectedTopics }) {
  if (!recs.length) return null;

  const lo = Math.max(BASE_RECOMMEND_RATING, Math.floor((userRating - 100) / RATING_STEP) * RATING_STEP);
  const hi = Math.ceil((userRating + NORMAL_RANGE) / RATING_STEP) * RATING_STEP;
  const isStretchMode = recs.every((r) => r.isStretch);
  const firstTag = recs[0]?.matchedTags?.[0];

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ padding: 24 }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{
            background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
            borderRadius: "var(--radius-sm)",
            width: 32, height: 32,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--on-primary)",
            flexShrink: 0,
          }}>
            <BookIcon size={16} />
          </div>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>
            Curated Problem Set
          </div>
        </div>

        <div style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
          {selectedTopics?.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              Focus:
              {selectedTopics.map((t, i) => (
                <span key={t} style={{ color: "var(--primary-bright)", fontWeight: 700 }}>
                  {t}{i < selectedTopics.length - 1 ? "," : ""}
                </span>
              ))}
            </div>
          ) : (
            <div>Focus: <span style={{ color: "var(--primary-bright)", fontWeight: 700 }}>{firstTag}</span></div>
          )}
          <div style={{ marginTop: 4 }}>
            Difficulty Range: <span style={{ color: "var(--on-surface)", fontWeight: 600 }}>
              {lo} – {hi}
            </span>
          </div>

          {isStretchMode && (
            <div style={{
              marginTop: 12,
              padding: "12px 16px",
              background: "var(--warning-container)",
              border: "1px solid rgba(251, 191, 36, 0.15)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              color: "var(--warning)",
              lineHeight: 1.5,
              fontWeight: 500,
            }}>
              You've solved all <strong>{firstTag || "this topic"}</strong> problems in your normal range. Showing harder stretch problems instead.
            </div>
          )}
        </div>

        <div style={{
          marginTop: 12,
          padding: "8px 12px",
          background: "var(--surface-2)",
          borderRadius: "var(--radius-sm)",
          fontSize: 11,
          color: "var(--text-muted)",
          lineHeight: 1.6,
          fontFamily: "var(--font-body)",
        }}>
          Prioritized by coverage across selected topics and community engagement.
        </div>
      </div>

      {/* Problem list */}
      <motion.div
        className="recommendation-list"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        {recs.map((p, i) => {
          const rec = normalizeRec(p);
          const dc = diffColor(rec.rating);
          const key = rec.index ? `${rec.contestId}-${rec.index}` : rec.problem_id || `${rec.name}-${i}`;
          const platformLabel = rec.platform === "lc" ? "LC" : "CF";

          return (
            <motion.a
              key={key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.06, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
              href={rec.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surface-dim)",
                border: "1px solid var(--outline)",
                borderRadius: "var(--radius-sm)",
                textDecoration: "none",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                fontFamily: "var(--font-body)"
              }}
              className="problem-item"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <div style={{
                  background: dc.hoverBg,
                  color: dc.text,
                  padding: "4px 0",
                  width: 54,
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: "center",
                  flexShrink: 0,
                  fontFamily: "var(--font-heading)",
                  border: "1px solid rgba(128,128,128,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                }}>
                  <span>{rec.rating || "—"}</span>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    marginBottom: 2,
                    letterSpacing: "0.05em",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}>
                    {rec.contestId && rec.index ? (
                      <span>{rec.contestId}{rec.index}</span>
                    ) : (
                      <span style={{ fontSize: 9 }}>{rec.name.slice(0, 20)}</span>
                    )}
                    <span style={{
                      background: rec.platform === "lc" ? "rgba(40, 167, 69, 0.15)" : "rgba(0, 102, 255, 0.15)",
                      color: rec.platform === "lc" ? "#28a745" : "#0066ff",
                      padding: "1px 4px",
                      borderRadius: 3,
                      fontSize: 8,
                      fontWeight: 700,
                    }}>
                      {platformLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {rec.name}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0, marginLeft: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                    {rec.platform === "lc" ? null : rec.solvedCount > 0 ? (
                      `${rec.solvedCount.toLocaleString()} solved`
                    ) : (
                      <span style={{ color: "var(--primary-bright)", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>NEW</span>
                    )}
                  </div>
                </div>
                <div style={{ color: "var(--text-muted)", opacity: 0.5 }}>
                  <ExternalLinkIcon size={14} />
                </div>
              </div>
            </motion.a>
          );
        })}
      </motion.div>

    </motion.div>
  );
}
