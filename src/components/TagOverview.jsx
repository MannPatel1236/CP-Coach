import { acColor } from "../utils.js";

export default function TagOverview({ tags }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 16, fontFamily: "var(--font-body)" }}>
        Technical Inventory
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((t) => {
          const c = acColor(t.acRate);
          return (
            <span
              key={t.tag}
              title={`${t.solved}/${t.attempts} solved · avg ★${t.avgRating ?? "?"}`}
              style={{
                display: "inline-block",
                background: t.acRate < 40
                  ? "rgba(244, 63, 94, 0.06)"
                  : t.acRate < 65
                  ? "rgba(245, 158, 11, 0.06)"
                  : "rgba(74, 222, 128, 0.06)",
                border: `1px solid ${t.acRate < 40
                  ? "rgba(244, 63, 94, 0.15)"
                  : t.acRate < 65
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(74, 222, 128, 0.15)"}`,
                color: c,
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
                fontSize: 11,
                fontWeight: 600,
                cursor: "default",
                transition: "all 0.2s ease",
                fontFamily: "var(--font-body)"
              }}
            >
              {t.tag} {t.acRate}%
            </span>
          );
        })}
      </div>
    </div>
  );
}
