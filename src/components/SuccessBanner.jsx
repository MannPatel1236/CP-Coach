import { CheckIcon } from "./Icons";

export default function SuccessBanner() {
  return (
    <div role="status" aria-live="polite" style={{
      background: "linear-gradient(135deg, rgba(52, 211, 153, 0.04), transparent)",
      border: "1px solid rgba(52, 211, 153, 0.12)",
      borderRadius: "var(--radius-lg)",
      padding: "20px 22px",
      display: "flex",
      alignItems: "center",
      gap: 18,
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        color: "var(--success)",
        background: "rgba(52, 211, 153, 0.08)",
        width: 40, height: 40,
        borderRadius: "var(--radius-full)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <CheckIcon size={22} />
      </div>
      <div>
        <div className="font-heading" style={{ fontWeight: 600, fontSize: 16, color: "var(--success)", marginBottom: 2 }}>
          Well Done!
        </div>
        <div style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.5, fontFamily: "var(--font-body)" }}>
          Your AC rate is above 65% across all topics. No weak areas found.
        </div>
      </div>
    </div>
  );
}
