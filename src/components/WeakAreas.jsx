import { acColor } from "../utils.js";
import { AlertIcon } from "./Icons";

export default function WeakAreas({ weakTags, selectedTag, onSelectTag }) {
  if (!weakTags.length) return null;

  return (
    <div style={{
      background: "var(--surface-1)",
      border: "1px solid var(--outline)",
      borderRadius: "var(--radius-lg)",
      padding: 24,
    }}>
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 8,
        fontSize: 11, 
        color: "var(--error)", 
        letterSpacing: "0.1em", 
        textTransform: "uppercase", 
        fontWeight: 700,
        marginBottom: 16,
        fontFamily: "var(--font-body)"
      }}>
        <AlertIcon size={14} />
        {weakTags.every(t => t.lowVolume) ? "Performance Calibration" : "Technical Vulnerabilities"}
      </div>

      {weakTags.map((t) => {
        const isActive = t.tag === selectedTag;
        return (
          <div
            key={t.tag}
            onClick={() => onSelectTag(t.tag)}
            style={{
              marginBottom: 8,
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              background: isActive ? "rgba(93, 92, 255, 0.08)" : "transparent",
              border: "1px solid",
              borderColor: isActive ? "var(--primary-container)" : "transparent",
              boxShadow: isActive ? "0 0 16px var(--primary-glow)" : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--on-surface)", fontWeight: 500, fontFamily: "var(--font-body)" }}>{t.tag}</span>
              <span style={{ fontSize: 13, color: acColor(t.acRate), fontWeight: 700, fontFamily: "var(--font-heading)" }}>{t.acRate}%</span>
            </div>

            {/* Progress bar — pill shape */}
            <div style={{ height: 4, background: "var(--surface-dim)", borderRadius: "var(--radius-full)", overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${t.acRate}%`,
                height: "100%",
                background: acColor(t.acRate),
                borderRadius: "var(--radius-full)",
                transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
              }} />
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontWeight: 500, fontFamily: "var(--font-body)" }}>
              {t.solved} / {t.attempts} solved
              {t.avgRating ? ` · ${t.avgRating} Rating` : ""}
            </div>

            {isActive && (
              <div style={{
                marginTop: 8,
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "var(--primary)",
                fontWeight: 700,
                fontFamily: "var(--font-body)"
              }}>
                TARGET PROBLEMS →
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
