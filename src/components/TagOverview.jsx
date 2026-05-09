import { acColor } from "../utils.js";
import { useState } from "react";

export default function TagOverview({ tags }) {
  const [hoveredTag, setHoveredTag] = useState(null);

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
          const isHovered = hoveredTag === t.tag;
          return (
            <span
              key={t.tag}
              title={`${t.solved}/${t.attempts} solved · avg ★${t.avgRating ?? "?"}`}
              onMouseEnter={() => setHoveredTag(t.tag)}
              onMouseLeave={() => setHoveredTag(null)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: isHovered
                  ? `${c}20`
                  : t.acRate < 40
                  ? "rgba(248, 113, 113, 0.06)"
                  : t.acRate < 65
                  ? "rgba(251, 191, 36, 0.06)"
                  : "rgba(52, 211, 153, 0.06)",
                border: `1px solid ${isHovered ? c + "40" : t.acRate < 40
                  ? "rgba(248, 113, 113, 0.15)"
                  : t.acRate < 65
                  ? "rgba(251, 191, 36, 0.15)"
                  : "rgba(52, 211, 153, 0.15)"}`,
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
