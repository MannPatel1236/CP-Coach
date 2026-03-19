import { LogoIcon } from "./Icons";

export default function Header() {
  return (
    <div style={{
      borderBottom: "1px solid var(--border-color)",
      padding: "20px 36px",
      background: "rgba(8, 15, 34, 0.8)",
      backdropFilter: "blur(12px)",
      display: "flex",
      alignItems: "center",
      gap: 14,
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        width: 38, height: 38,
        background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))",
        borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#050b18",
        flexShrink: 0,
        boxShadow: "0 0 20px rgba(0, 255, 135, 0.2)",
      }}>
        <LogoIcon size={22} />
      </div>

      <div>
        <div className="font-heading" style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
          CP Coach
        </div>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 500, letterSpacing: "0.15em", marginTop: 2, textTransform: "uppercase" }}>
          Personalized Competitive Programming Analysis
        </div>
      </div>


    </div>
  );
}
