import { SearchIcon } from "./Icons";

export default function SearchBar({ handle, setHandle, onAnalyze, loading, hasResult, onClear, analysisMode, setAnalysisMode }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") onAnalyze();
  };

  return (
    <div style={{ padding: "32px 48px 16px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 600,
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
            background: "var(--surface-2)",
            border: "1px solid var(--outline)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 16px 12px 48px",
            color: "var(--on-surface)",
            fontSize: 15,
            transition: "all 0.2s ease",
            outline: "none",
            fontFamily: "var(--font-body)"
          }}
          className="search-input"
        />
        
        <button
          onClick={onAnalyze}
          disabled={loading || !handle.trim()}
          className="btn-primary"
          style={{
            padding: "12px 28px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontWeight: 700,
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
              padding: "12px 20px",
              borderRadius: "var(--radius-sm)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
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
        marginTop: 16,
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
                ? "var(--primary-container)"
                : "var(--surface-2)",
              border: "1px solid",
              borderColor: analysisMode === opt.value ? "var(--primary-container)" : "var(--outline)",
              color: analysisMode === opt.value
                ? "var(--on-primary)"
                : "var(--text-muted)",
              padding: "5px 14px",
              borderRadius: "var(--radius-full)",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              fontFamily: "var(--font-body)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              boxShadow: analysisMode === opt.value ? "0 0 12px var(--primary-glow)" : "none",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <style jsx="true">{`
        .search-input:focus {
          border-color: var(--primary-container) !important;
          background: var(--surface-3) !important;
          box-shadow: 0 0 16px var(--primary-glow);
        }
        .clear-btn:hover {
          border-color: var(--on-surface-variant);
          color: var(--on-surface);
        }
      `}</style>
    </div>
  );
}
