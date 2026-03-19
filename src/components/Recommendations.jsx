import { diffColor } from "../utils.js";
import { ExternalLinkIcon, BookIcon } from "./Icons";

export default function Recommendations({ recs, userRating, selectedTopics, solvedSet }) {
  if (!recs.length) return null;

  const isStretchMode = recs.length > 0 && recs.every(r => r.isStretch);
  const isMultiTopic = selectedTopics && selectedTopics.length > 1;

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <BookIcon size={18} className="text-primary" />
          <div className="font-heading" style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>
            Recommended Problems
          </div>
        </div>
        
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          {selectedTopics?.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              Focus: 
              {selectedTopics.map((t, i) => (
                <span key={t} style={{ color: "var(--accent-secondary)", fontWeight: 600 }}>
                  {t}{i < selectedTopics.length - 1 ? "," : ""}
                </span>
              ))}
            </div>
          ) : (
            <div>Focus: <span style={{ color: "var(--accent-warning)", fontWeight: 600 }}>{recs[0]?.matchedTags?.[0]}</span></div>
          )}
          <div style={{ marginTop: 2 }}>
            Difficulty Range: <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{Math.max(800, Math.floor((userRating - 100) / 100) * 100)} – {Math.ceil((userRating + 350) / 100) * 100}</span>
          </div>
          {isStretchMode && (
            <div style={{
              marginTop: 8,
              padding: "10px 14px",
              background: "rgba(251, 191, 36, 0.06)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--accent-warning)",
              lineHeight: 1.6,
              fontWeight: 500,
            }}>
              You've solved all <strong>{recs[0]?.matchedTags?.[0] || "this topic"}</strong> problems
              in your normal range. Showing harder stretch problems instead.
            </div>
          )}
        </div>

        {/* B8: Coaching context line */}
        <div style={{
          marginTop: 8,
          padding: "8px 12px",
          background: "rgba(0, 180, 216, 0.04)",
          border: "1px solid rgba(0, 180, 216, 0.12)",
          borderRadius: 8,
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}>
          Sorted by coverage across your selected topics, then by community
          solve count — problems solved by more users at your rating are
          generally better learning material.
        </div>
      </div>

      {/* Problem list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recs.map((p) => {
          const dc = diffColor(p.rating);
          const key = `${p.contestId}-${p.index}`;
          const isSolved = solvedSet?.has(key);
          const isMultiMatch = p.matchedTags?.length > 1;

          return (
            <a
              key={key}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: isSolved ? "rgba(34, 197, 94, 0.05)" : isMultiMatch ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.2)",
                border: "1px solid",
                borderColor: isSolved ? "var(--accent-success)" : "var(--border-color)",
                borderRadius: 10,
                textDecoration: "none",
                transition: "all 0.2s ease",
              }}
              className="problem-item"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
                {/* Difficulty badge */}
                <div style={{
                  background: dc.bg,
                  border: `1px solid ${dc.border}`,
                  color: dc.text,
                  padding: "4px 0",
                  width: 54,
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  textAlign: "center",
                  flexShrink: 0,
                }}>
                  {p.rating || "—"}
                </div>

                <div style={{ minWidth: 0 }}>
                  {/* B2: Problem index */}
                  <div style={{
                    fontSize: 10,
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    marginBottom: 2,
                    letterSpacing: "0.05em",
                    opacity: 0.6,
                  }}>
                    {p.contestId}{p.index}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  {/* Show tags */}
                  {p.matchedTags?.length > 0 && isMultiTopic && (
                    <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {p.matchedTags.map((t) => (
                        <span key={t} style={{
                          fontSize: 10,
                          color: "var(--text-secondary)",
                          background: "var(--border-color)",
                          padding: "1px 6px",
                          borderRadius: 4,
                          fontWeight: 600,
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0, marginLeft: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
                    {/* B3: NEW label for zero-solved */}
                    {p.solvedCount > 0
                      ? `${p.solvedCount.toLocaleString()} solved`
                      : <span style={{ color: "var(--accent-primary)", fontWeight: 700, fontSize: 10 }}>NEW</span>
                    }
                  </div>
                </div>
                <div style={{ color: isSolved ? "var(--accent-success)" : "var(--text-secondary)", opacity: 0.8 }}>
                  <ExternalLinkIcon size={16} />
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <style jsx="true">{`
        .problem-item:hover {
          border-color: var(--accent-secondary) !important;
          background: var(--bg-card-hover) !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  );
}
