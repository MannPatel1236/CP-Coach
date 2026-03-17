import { SearchIcon } from "./Icons";

export default function SearchBar({ handle, setHandle, onAnalyze, loading }) {
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
