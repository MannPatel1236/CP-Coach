import { CheckIcon, TargetIcon } from "./Icons";

export default function TopicPicker({ topics, selected, onToggle, onConfirm, loading }) {
  if (!topics.length) return null;

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="font-heading" style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>
          Expand Your Skillset
        </div>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
          You're performing well in your current topics. Select 1–3 new areas to focus on next.
        </div>
      </div>

      {/* Topic cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {topics.map((tag, i) => {
          const isSelected = selected.includes(tag);
          return (
            <div
              key={tag}
              onClick={() => onToggle(tag)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                background: isSelected ? "rgba(0, 255, 135, 0.04)" : "rgba(0, 0, 0, 0.2)",
                border: "1px solid",
                borderColor: isSelected ? "var(--accent-primary)" : "var(--border-color)",
                borderRadius: 10,
                cursor: "pointer",
                transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                userSelect: "none",
              }}
              className="topic-item"
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{
                  width: 24, height: 24,
                  background: isSelected ? "var(--accent-primary)" : "var(--border-color)",
                  borderRadius: 6,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, color: isSelected ? "#050b18" : "var(--text-secondary)",
                  fontWeight: 800, flexShrink: 0,
                  transition: "all 0.2s ease",
                }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: isSelected ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {tag}
                </span>
              </div>

              {/* Checkbox */}
              <div style={{
                width: 20, height: 20,
                borderRadius: 6,
                border: "2px solid",
                borderColor: isSelected ? "var(--accent-primary)" : "var(--border-color)",
                background: isSelected ? "var(--accent-primary)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.2s ease",
                color: "#050b18",
              }}>
                {isSelected && <CheckIcon size={14} />}
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
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <TargetIcon size={18} />
        {loading
          ? "Targeting Problems..."
          : selected.length === 0
          ? "Select Topics to Begin"
          : `Generate Problems for ${selected.length} Topic${selected.length > 1 ? "s" : ""}`}
      </button>

      <style jsx="true">{`
        .topic-item:hover {
          border-color: ${selected.length > 0 ? "var(--accent-primary)" : "var(--accent-secondary)"};
          transform: translateX(4px);
        }
      `}</style>
    </div>
  );
}
