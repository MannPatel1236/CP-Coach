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
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <BookIcon size={18} style={{ color: "var(--primary)" }} />
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>
            Curated Problem Set
          </div>
        </div>
        
        <div style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
          {selectedTopics?.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              Focus: 
              {selectedTopics.map((t, i) => (
                <span key={t} style={{ color: "var(--primary)", fontWeight: 700 }}>
                  {t}{i < selectedTopics.length - 1 ? "," : ""}
                </span>
              ))}
            </div>
          ) : (
            <div>Focus: <span style={{ color: "var(--primary)", fontWeight: 700 }}>{recs[0]?.matchedTags?.[0]}</span></div>
          )}
          <div style={{ marginTop: 2 }}>
            Difficulty Range: <span style={{ color: "var(--on-surface)", fontWeight: 600 }}>{Math.max(800, Math.floor((userRating - 100) / 100) * 100)} – {Math.ceil((userRating + 350) / 100) * 100}</span>
          </div>

          {isStretchMode && (
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              background: "var(--warning-container)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              color: "var(--warning)",
              lineHeight: 1.6,
              fontWeight: 500,
            }}>
              You've solved all <strong>{recs[0]?.matchedTags?.[0] || "this topic"}</strong> problems
              in your normal range. Showing harder stretch problems instead.
            </div>
          )}
        </div>

        {/* Coaching context */}
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                padding: "10px 14px",
                background: isSolved ? "var(--success-container)" : "var(--surface-dim)",
                border: "1px solid",
                borderColor: isSolved ? "rgba(74, 222, 128, 0.15)" : "var(--outline)",
                borderRadius: "var(--radius-sm)",
                textDecoration: "none",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                fontFamily: "var(--font-body)"
              }}
              className="problem-item"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                {/* Difficulty badge */}
                <div style={{
                  background: isSolved ? "rgba(74, 222, 128, 0.1)" : "var(--surface-3)",
                  color: isSolved ? "var(--success)" : dc.text,
                  padding: "4px 0",
                  width: 52,
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: "center",
                  flexShrink: 0,
                  fontFamily: "var(--font-heading)",
                }}>
                  {p.rating || "—"}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 10,
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    marginBottom: 2,
                    letterSpacing: "0.05em",
                  }}>
                    {p.contestId}{p.index}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--on-surface)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0, marginLeft: 12 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
                    {p.solvedCount > 0
                      ? `${p.solvedCount.toLocaleString()} solved`
                      : <span style={{ color: "var(--primary)", fontWeight: 700, fontSize: 10, letterSpacing: "0.1em" }}>NEW</span>
                    }
                  </div>
                </div>
                <div style={{ color: isSolved ? "var(--success)" : "var(--text-muted)", opacity: 0.5 }}>
                  <ExternalLinkIcon size={14} />
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <style jsx="true">{`
        .problem-item:hover {
          border-color: var(--primary-container) !important;
          box-shadow: 0 0 16px var(--primary-glow);
          transform: translateX(4px);
        }
      `}</style>
    </div>
  );
}
