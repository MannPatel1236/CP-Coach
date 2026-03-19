import { SearchIcon } from "./Icons";

export default function SearchBar({ handle, setHandle, onAnalyze, loading, hasResult, onClear, analysisMode, setAnalysisMode }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") onAnalyze();
  };

  return (
    <div style={{ padding: "30px 36px 10px" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: 500,
        position: "relative"
      }}>
        <div style={{
          position: "absolute",
          left: 14,
          color: "var(--text-secondary)",
          display: "flex",
          alignItems: "center",
          pointerEvents: "none"
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
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            padding: "12px 16px 12px 42px",
            color: "var(--text-primary)",
            fontSize: 14,
            transition: "all 0.2s ease",
            outline: "none",
            letterSpacing: "0.02em"
          }}
          className="search-input"
        />
        
        <button
          onClick={onAnalyze}
          disabled={loading || !handle.trim()}
          className="btn-primary"
          style={{
            padding: "12px 24px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          {loading ? "Analyzing..." : "Analyze Profile"}
        </button>

        {hasResult && (
          <button
            onClick={onClear}
            style={{
              background: "transparent",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 10,
        paddingLeft: 2,
      }}>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>
          Analysis depth:
        </span>
        {[
          { value: "quick", label: "Quick  (last 1,000)" },
          { value: "deep",  label: "Deep  (full history, up to 8,000)" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setAnalysisMode(opt.value)}
            style={{
              background: analysisMode === opt.value
                ? "rgba(0, 180, 216, 0.12)"
                : "transparent",
              border: "1px solid",
              borderColor: analysisMode === opt.value
                ? "var(--accent-secondary)"
                : "var(--border-color)",
              color: analysisMode === opt.value
                ? "var(--accent-secondary)"
                : "var(--text-secondary)",
              padding: "4px 12px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <style jsx="true">{`
        .search-input:focus {
          border-color: var(--accent-secondary) !important;
          background: var(--bg-card-hover) !important;
          box-shadow: 0 0 0 4px rgba(0, 180, 216, 0.1);
        }
      `}</style>
    </div>
  );
}
