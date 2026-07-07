import { memo } from "react";
import { acColor } from "../utils.js";
import { AlertIcon } from "./Icons";

function WeakAreas({ weakTags, selectedTag, onSelectTag }) {
  if (!weakTags.length) return null;

  const isLowVolume = weakTags.some(t => t.lowVolume);

  return (
    <div className="card">
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        color: isLowVolume ? "var(--warning)" : "var(--error)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        fontWeight: 700,
        marginBottom: 16,
        fontFamily: "var(--font-body)"
      }}>
        <AlertIcon size={14} />
        {isLowVolume ? "Performance Calibration" : "Technical Vulnerabilities"}
      </div>

      {weakTags.map((t) => {
        const isActive = t.tag === selectedTag;
        return (
          <div
            role="button"
            tabIndex={0}
            aria-pressed={isActive}
            key={t.tag}
            onClick={() => onSelectTag(t.tag)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectTag(t.tag); }}
            style={{
              marginBottom: 8,
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              background: isActive
                ? "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(79, 70, 229, 0.04))"
                : "transparent",
              border: "1px solid",
              borderColor: isActive ? "var(--primary-container)" : "transparent",
              boxShadow: isActive ? "0 0 20px var(--primary-glow)" : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--on-surface)", fontWeight: 500, fontFamily: "var(--font-body)" }}>{t.tag}</span>
              <span className="font-heading" style={{ fontSize: 14, color: acColor(t.acRate), fontWeight: 700 }}>{t.acRate}%</span>
            </div>

            <div style={{ height: 4, background: "var(--surface-dim)", borderRadius: "var(--radius-full)", overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${t.acRate}%`,
                height: "100%",
                background: `linear-gradient(90deg, ${acColor(t.acRate)}cc, ${acColor(t.acRate)})`,
                borderRadius: "var(--radius-full)",
                transition: "width 1.2s cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: `0 0 8px ${acColor(t.acRate)}44`,
              }}
                role="progressbar"
                aria-valuenow={t.acRate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${t.acRate}% solve rate`}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, fontFamily: "var(--font-body)" }}>
                {(t.solved ?? 0)} / {(t.attempts ?? 0)} solved
                {t.avgRating ? ` · ${t.avgRating} Rating` : ""}
              </span>
              {isActive && (
                <span style={{
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  color: "var(--primary)",
                  fontWeight: 700,
                  fontFamily: "var(--font-body)",
                  textTransform: "uppercase",
                }}>
                  Targeted
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(WeakAreas);
