import { LogoIcon } from "./Icons";

export default function Header({ onHome }) {
  return (
    <div style={{
      padding: "24px 48px",
      background: "rgba(18, 19, 23, 0.85)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderBottom: "1px solid var(--outline)",
      display: "flex",
      alignItems: "center",
      gap: 20,
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div 
        onClick={onHome}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          cursor: "pointer",
          transition: "opacity 0.2s ease"
        }}
        className="header-logo-group"
      >
        <div style={{
          width: 40, height: 40,
          background: "var(--primary-container)",
          borderRadius: "var(--radius-sm)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--on-primary)",
          flexShrink: 0,
          boxShadow: "0 0 16px var(--primary-glow)",
        }}>
          <LogoIcon size={22} />
        </div>

        <div>
          <div className="font-heading" style={{ fontSize: 22, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            CP Coach
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.1em", marginTop: 4, textTransform: "uppercase", fontFamily: "var(--font-body)" }}>
            Competitive Programming Analysis
          </div>
        </div>
      </div>

      <style jsx="true">{`
        .header-logo-group:hover {
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
