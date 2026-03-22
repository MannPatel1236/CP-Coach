import { acColor } from "../utils.js";
import { AlertIcon } from "./Icons";

export default function WeakAreas({ weakTags, selectedTag, onSelectTag }) {
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
        {weakTags.every(t => t.lowVolume) ? "Needs More Practice" : "Weak Areas Detected"}
      </div>

      {weakTags.map((t) => {
        const isActive = t.tag === selectedTag;
        return (
          <div
            key={t.tag}
            onClick={() => onSelectTag(t.tag)}
            style={{
              marginBottom: 16,
              cursor: "pointer",
              transition: "all 0.2s ease",
              padding: 10,
              borderRadius: 8,
              border: isActive ? "1px solid var(--accent-secondary)" : "1px solid transparent",
              background: isActive ? "rgba(0, 180, 216, 0.06)" : "transparent",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{t.tag}</span>
              <span style={{ fontSize: 13, color: acColor(t.acRate), fontWeight: 700 }}>{t.acRate}%</span>
              {t.lowVolume && (
                <span style={{ fontSize: 10, color: "var(--accent-warning)", fontWeight: 600, marginLeft: 4 }}>
                  Low practice volume
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: "rgba(0,0,0,0.2)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${t.acRate}%`,
                height: "100%",
                background: acColor(t.acRate),
                borderRadius: 3,
                transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)",
              }} />
              <div style={{
                position: "absolute",
                left: "65%",
                top: 0,
                width: 2,
                height: "100%",
                background: "rgba(251, 191, 36, 0.6)",
                borderRadius: 1,
              }} />
            </div>

            <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 5, fontWeight: 500 }}>
              {t.solved} / {t.attempts} solved
              {t.avgRating ? ` · Avg. Rating ${t.avgRating}` : ""}
            </div>

            {isActive && (
              <div style={{
                marginTop: 6,
                fontSize: 9,
                letterSpacing: "0.1em",
                color: "var(--accent-secondary)",
                fontWeight: 700,
              }}>
                VIEW PROBLEMS →
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
