import { SearchIcon } from "./Icons";

export default function SearchBar({ handle, setHandle, onAnalyze, loading, hasResult, onClear, analysisMode, setAnalysisMode }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") onAnalyze();
  };

  return (
    <div style={{ padding: "28px 48px 20px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 640,
        position: "relative"
      }}>
        <div style={{
          position: "absolute",
          left: 16,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          pointerEvents: "none",
          zIndex: 10
        }}>
          <SearchIcon size={18} />
        </div>

        <input
          type="text"
          placeholder="Enter Codeforces Handle..."
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            background: "linear-gradient(145deg, var(--surface-2), var(--surface-1))",
            border: "1px solid var(--outline)",
            borderRadius: "var(--radius-sm)",
            padding: "13px 16px 13px 48px",
            color: "var(--on-surface)",
            fontSize: 15,
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            outline: "none",
            fontFamily: "var(--font-body)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}
          className="search-input"
        />

        <button
          onClick={onAnalyze}
          disabled={loading || !handle.trim()}
          className="btn-primary"
          style={{
            padding: "13px 28px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontWeight: 700,
            borderRadius: "var(--radius-sm)",
          }}
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>

        {hasResult && (
          <button
            onClick={onClear}
            style={{
              background: "transparent",
              border: "1px solid var(--outline)",
              color: "var(--text-muted)",
              padding: "13px 20px",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-body)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
            className="clear-btn"
          >
            Clear
          </button>
        )}
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: 14,
        paddingLeft: 2,
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Depth:
        </span>
        {[
          { value: "quick", label: "Quick" },
          { value: "deep",  label: "Deep" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setAnalysisMode(opt.value)}
            style={{
              background: analysisMode === opt.value
                ? "linear-gradient(135deg, var(--primary-container), var(--primary-dim))"
                : "var(--surface-2)",
              border: "1px solid",
              borderColor: analysisMode === opt.value ? "var(--primary-container)" : "var(--outline)",
              color: analysisMode === opt.value ? "var(--on-primary)" : "var(--text-muted)",
              padding: "6px 16px",
              borderRadius: "var(--radius-full)",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              fontFamily: "var(--font-body)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              boxShadow: analysisMode === opt.value ? "0 0 16px var(--primary-glow)" : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <style jsx="true">{`
        .search-input:focus {
          border-color: var(--primary-container) !important;
          background: linear-gradient(145deg, var(--surface-3), var(--surface-2)) !important;
          box-shadow: 0 0 20px var(--primary-glow), inset 0 1px 0 rgba(255,255,255,0.03) !important;
        }
        .clear-btn:hover {
          border-color: var(--on-surface-variant);
          color: var(--on-surface);
          background: var(--surface-2);
        }
      `}</style>
    </div>
  );
}
