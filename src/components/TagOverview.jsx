import { memo } from "react";
import { acColor } from "../utils.js";

const AC_STYLES = {
  low:    { bg: "rgba(248, 113, 113, 0.06)",  border: "rgba(248, 113, 113, 0.15)", },
  medium: { bg: "rgba(251, 191, 36, 0.06)",   border: "rgba(251, 191, 36, 0.15)", },
  high:   { bg: "rgba(52, 211, 153, 0.06)",  border: "rgba(52, 211, 153, 0.15)", },
};

function acStyle(rate) {
  if (rate < 40) return AC_STYLES.low;
  if (rate < 65) return AC_STYLES.medium;
  return AC_STYLES.high;
}

function TagOverview({ tags }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{
        fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase",
        fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-body)"
      }}>
        Technical Inventory
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((t) => {
          const c = acColor(t.acRate);
          const base = acStyle(t.acRate);
          const tagKey = t.tag;

          return (
            <span
              key={tagKey}
              title={`${t.solved}/${t.attempts} solved · avg ★${t.avgRating ?? "?"}`}
              className="tag-pill"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: base.bg,
                border: `1px solid ${base.border}`,
                color: c,
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "default",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                fontFamily: "var(--font-body)",
                userSelect: "none",
              }}
            >
              {t.tag} <span style={{ opacity: 0.6 }}>{t.acRate}%</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default memo(TagOverview);
