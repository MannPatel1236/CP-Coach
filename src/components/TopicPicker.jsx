import { useState } from "react";
import { CheckIcon, TargetIcon } from "./Icons";

export default function TopicPicker({ topics, selected, onToggle, onConfirm, loading }) {
  const [hoveredTag, setHoveredTag] = useState(null);

  if (!topics.length) return null;

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>
          Expand Strategic Reach
        </div>
        <div style={{ fontSize: 13, color: "var(--on-surface-variant)", marginTop: 8, lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
          Foundational mastery achieved. Select new territories for strategic advancement.
        </div>
      </div>

      {/* Topic cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {topics.map((tag, i) => {
          const isSelected = selected.includes(tag);
          const isHovered = hoveredTag === tag;
          return (
            <div
              key={tag}
              onClick={() => onToggle(tag)}
              onMouseEnter={() => setHoveredTag(tag)}
              onMouseLeave={() => setHoveredTag(null)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: isSelected ? "rgba(93, 92, 255, 0.08)" : "var(--surface-dim)",
                border: "1px solid",
                borderColor: isSelected ? "var(--primary-container)"
                  : isHovered ? "var(--primary-container)"
                  : "var(--outline)",
                boxShadow: isHovered || isSelected ? "0 0 16px var(--primary-glow)" : "none",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                userSelect: "none",
                fontFamily: "var(--font-body)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{
                  width: 24, height: 24,
                  background: isSelected ? "var(--primary-container)" : "var(--surface-4)",
                  borderRadius: "var(--radius-sm)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: isSelected ? "var(--on-primary)" : "var(--text-muted)",
                  fontWeight: 800, flexShrink: 0,
                  transition: "all 0.2s ease",
                  fontFamily: "var(--font-heading)",
                }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: isSelected ? "var(--on-surface)" : "var(--on-surface-variant)" }}>
                  {tag}
                </span>
              </div>

              {/* Checkbox */}
              <div style={{
                width: 18, height: 18,
                borderRadius: "var(--radius-sm)",
                border: "2px solid",
                borderColor: isSelected ? "var(--primary-container)" : "var(--outline)",
                background: isSelected ? "var(--primary-container)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.2s ease",
                color: "var(--on-primary)",
              }}>
                {isSelected && <CheckIcon size={12} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        disabled={selected.length === 0 || loading}
        className="btn-primary"
        style={{
          width: "100%",
          padding: "14px",
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          fontFamily: "var(--font-body)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        <TargetIcon size={16} />
        {loading
          ? "SYNCHRONIZING..."
          : selected.length === 0
          ? "SELECT DOMAINS"
          : `SYNTHESIZE PATH FOR ${selected.length} TOPIC${selected.length > 1 ? "S" : ""}`}
      </button>
    </div>
  );
}
