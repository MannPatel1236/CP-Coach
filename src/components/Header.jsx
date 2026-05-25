import { useState } from "react";
import { LogoIcon } from "./Icons";

export default function Header({ onHome }) {
  const [hovered, setHovered] = useState(false);
  return (
    <header role="banner" className="header-wrapper" style={{
      padding: "16px 48px",
      background: "linear-gradient(180deg, rgba(2,4,8,0.85) 0%, rgba(2,4,8,0.6) 100%)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderBottom: "1px solid rgba(30, 35, 53, 0.5)",
      display: "flex",
      alignItems: "center",
      gap: 20,
      position: "sticky",
      top: 0,
      zIndex: 30,
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onHome}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onHome(); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          cursor: "pointer",
          transition: "opacity 0.25s ease",
          opacity: hovered ? 0.75 : 1,
        }}
        className="header-logo-group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{
          width: 38, height: 38,
          background: "linear-gradient(135deg, var(--primary-container) 0%, var(--primary-dim) 100%)",
          borderRadius: "var(--radius-sm)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--on-primary)",
          flexShrink: 0,
          boxShadow: "0 4px 16px -2px var(--primary-glow)",
        }}>
          <LogoIcon size={20} />
        </div>

        <div>
          <div className="font-heading" style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
            CP Coach
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.12em", marginTop: 2, textTransform: "uppercase", fontFamily: "var(--font-body)" }}>
            Competitive Programming
          </div>
        </div>
      </div>
    </header>
  );
}
