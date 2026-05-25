import React, { useState } from "react";

export default function PrivacyPolicy() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ padding: "24px 48px", fontSize: "0.85rem", color: "var(--text-muted, #64748b)", borderTop: "1px solid var(--outline, #1e2335)" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", textDecoration: "underline", fontSize: "0.85rem" }}
      >
        Privacy Policy
      </button>

      {open && (
        <div style={{ marginTop: "12px", maxWidth: 700 }}>
          <h2 style={{ fontSize: "1rem", marginBottom: "8px", color: "var(--on-surface, #e2e4f0)" }}>Privacy Policy</h2>
          <p style={{ marginBottom: "8px" }}>We collect your competitive programming handle only to fetch public data from Codeforces and/or LeetCode.</p>
          <p style={{ marginBottom: "8px" }}>We do not sell, share, or transfer your personal data to third parties.</p>
          <p style={{ marginBottom: "8px" }}>You may request deletion of all your data at any time by emailing the support contact.</p>
          <p>Data is used solely for generating personalized training recommendations.</p>
        </div>
      )}
    </div>
  );
}
