import React from "react";
import { AlertIcon, RefreshIcon, CopyIcon } from "./Icons";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
    this._copyTimer = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  componentWillUnmount() {
    if (this._copyTimer) {
      clearTimeout(this._copyTimer);
    }
  }

  copyError = () => {
    const { error } = this.state;
    const text = error?.stack || error?.message || "Unknown error";
    navigator.clipboard?.writeText(text).catch(() => null);
    this.setState({ copied: true });
    this._copyTimer = setTimeout(() => this.setState({ copied: false }), 2000);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "2rem",
            textAlign: "center",
            fontFamily: "var(--font-body)",
            color: "var(--on-surface)",
            background: "var(--surface-base)",
          }}
        >
          <div style={{
            width: 64, height: 64,
            background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
            borderRadius: "var(--radius-lg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 24,
            boxShadow: "0 0 32px var(--primary-glow)",
          }}>
            <AlertIcon size={32} />
          </div>

          <h1 style={{
            fontSize: 24, fontWeight: 700, marginBottom: 12,
            color: "#ffffff", fontFamily: "var(--font-heading)",
          }}>
            Something went wrong.
          </h1>
          <p style={{
            color: "var(--on-surface-variant)", marginBottom: 8,
            maxWidth: 400, lineHeight: 1.6,
          }}>
            An unexpected error occurred. Your data is safe. Refresh the page to try again.
          </p>

          {this.state.error && (
            <pre style={{
              background: "var(--surface-1)",
              border: "1px solid var(--outline)",
              borderRadius: "var(--radius-sm)",
              padding: "12px 16px",
              fontSize: 11,
              color: "var(--text-muted)",
              textAlign: "left",
              maxWidth: 480,
              maxHeight: 120,
              overflow: "auto",
              margin: "16px 0 12px",
              fontFamily: "var(--font-mono)",
            }}>
              {this.state.error?.stack || this.state.error?.message || "Unknown error"}
            </pre>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button
              onClick={this.copyError}
              style={{
                padding: "10px 20px",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--outline)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-body)",
                transition: "all 0.25s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary-container)"; e.currentTarget.style.color = "var(--on-surface)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--outline)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <CopyIcon size={14} />
              {this.state.copied ? "Copied!" : "Copy Error"}
            </button>

            <button
              onClick={() => window.location.reload()}
              ref={(el) => { if (el) el.focus(); }}
              style={{
                padding: "10px 20px",
                borderRadius: "var(--radius-sm)",
                border: "none",
                background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: "var(--font-body)",
                transition: "all 0.25s ease",
              }}
            >
              <RefreshIcon size={14} />
              Refresh Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
