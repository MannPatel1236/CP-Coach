import { AlertIcon } from "./Icons";

export default function ErrorState({ message }) {
  return (
    <div className="error-wrapper" role="alert" aria-live="polite" style={{
      margin: "16px 48px",
      padding: "18px 24px",
      background: "var(--error-container)",
      border: "1px solid rgba(248, 113, 113, 0.12)",
      borderRadius: "var(--radius-lg)",
      color: "var(--error)",
      fontSize: 14,
      maxWidth: 640,
      display: "flex",
      alignItems: "center",
      gap: 14,
      fontFamily: "var(--font-body)",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{
        width: 24, height: 24,
        background: "rgba(248, 113, 113, 0.1)",
        borderRadius: "var(--radius-sm)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <AlertIcon size={14} />
      </div>
      {message}
    </div>
  );
}
