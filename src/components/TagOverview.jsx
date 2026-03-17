import { acColor } from "../utils.js";

export default function TagOverview({ tags }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 10, color: "var(--text-secondary)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, marginBottom: 16 }}>
        Skill Inventory
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
                  ? "rgba(248, 113, 113, 0.08)"
                  : t.acRate < 65
                  ? "rgba(251, 191, 36, 0.08)"
                  : "rgba(74, 222, 128, 0.06)",
                border: `1px solid ${t.acRate < 40
                  ? "rgba(248, 113, 113, 0.2)"
                  : t.acRate < 65
                  ? "rgba(251, 191, 36, 0.2)"
                  : "rgba(74, 222, 128, 0.15)"}`,
                color: c,
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: "default",
                transition: "all 0.2s ease",
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
