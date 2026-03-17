import { acColor } from "../utils.js";
import { AlertIcon } from "./Icons";

export default function WeakAreas({ weakTags }) {
  if (!weakTags.length) return null;

  return (
    <div style={{
      background: "rgba(248, 113, 113, 0.05)",
      border: "1px solid rgba(248, 113, 113, 0.2)",
      borderRadius: 12,
      padding: 20,
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 8,
        fontSize: 10, 
        color: "var(--accent-danger)", 
        letterSpacing: "0.12em", 
        textTransform: "uppercase", 
        fontWeight: 700,
        marginBottom: 16 
      }}>
        <AlertIcon size={14} />
        Weak Areas Detected
      </div>

      {weakTags.map((t) => (
        <div key={t.tag} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{t.tag}</span>
            <span style={{ fontSize: 13, color: acColor(t.acRate), fontWeight: 700 }}>{t.acRate}%</span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: "rgba(0,0,0,0.2)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${t.acRate}%`,
              height: "100%",
              background: acColor(t.acRate),
              borderRadius: 3,
              transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
            }} />
          </div>

          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 5, fontWeight: 500 }}>
            {t.solved} / {t.attempts} solved
            {t.avgRating ? ` · Avg. Rating ${t.avgRating}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}
