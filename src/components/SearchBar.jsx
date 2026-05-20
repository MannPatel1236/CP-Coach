import { SearchIcon, CodeforcesIcon, LeetCodeIcon } from "./Icons";

export default function SearchBar({ 
  handle, setHandle, 
  cfHandle, setCfHandle,
  lcHandle, setLcHandle,
  onAnalyze, loading, hasResult, onClear, 
  analysisMode, setAnalysisMode, 
  platform, setPlatform, 
  combinedPlatform, setCombinedPlatform 
}) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter") onAnalyze();
  };

  const canAnalyze = combinedPlatform 
    ? (cfHandle?.trim() || lcHandle?.trim())
    : handle?.trim();

  const placeholder = combinedPlatform 
    ? null
    : platform === "lc" 
    ? "Enter LeetCode username..." 
    : "Enter Codeforces handle...";

  const platformOptions = [
    { value: "cf", label: "CF", icon: <CodeforcesIcon size={12} /> },
    { value: "lc", label: "LC", icon: <LeetCodeIcon size={12} /> },
  ];

  return (
    <div className="search-bar-wrapper" style={{ padding: "28px 48px 20px" }}>
      <div className="search-row" style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: combinedPlatform ? 800 : 640,
      }}>
        {combinedPlatform ? (
          <>
            <div className="search-input-group" style={{ position: "relative", flex: 1 }}>
              <div style={{
                position: "absolute",
                left: 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#0066ff",
                display: "flex",
                alignItems: "center",
                pointerEvents: "none",
                zIndex: 10
              }}>
                <CodeforcesIcon size={18} />
              </div>
              <input
                type="text"
                placeholder="Codeforces handle..."
                aria-label="Codeforces Handle"
                value={cfHandle || ""}
                onChange={(e) => setCfHandle(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  width: "100%",
                  background: "linear-gradient(145deg, var(--surface-2), var(--surface-1))",
                  border: "1px solid var(--outline)",
                  borderRadius: "var(--radius-sm)",
                  padding: "13px 16px 13px 48px",
                  color: "var(--on-surface)",
                  fontSize: 15,
                  outline: "none",
                  fontFamily: "var(--font-body)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
                className="search-input"
              />
            </div>
            <div className="search-input-group" style={{ position: "relative", flex: 1 }}>
              <div style={{
                position: "absolute",
                left: 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#28a745",
                display: "flex",
                alignItems: "center",
                pointerEvents: "none",
                zIndex: 10
              }}>
                <LeetCodeIcon size={18} />
              </div>
              <input
                type="text"
                placeholder="LeetCode username..."
                aria-label="LeetCode Username"
                value={lcHandle || ""}
                onChange={(e) => setLcHandle(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  width: "100%",
                  background: "linear-gradient(145deg, var(--surface-2), var(--surface-1))",
                  border: "1px solid var(--outline)",
                  borderRadius: "var(--radius-sm)",
                  padding: "13px 16px 13px 48px",
                  color: "var(--on-surface)",
                  fontSize: 15,
                  outline: "none",
                  fontFamily: "var(--font-body)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
                className="search-input"
              />
            </div>
          </>
        ) : (
          <div className="search-input-group" style={{ position: "relative", flex: 1 }}>
            <div style={{
              position: "absolute",
              left: 16,
              top: "50%",
              transform: "translateY(-50%)",
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
              placeholder={placeholder}
              aria-label={platform === "lc" ? "LeetCode Username" : "Codeforces Handle"}
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{
                width: "100%",
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
          </div>
        )}

        <button
          type="button"
          onClick={onAnalyze}
          disabled={loading || !canAnalyze}
          className="btn-primary analyze-btn"
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
            type="button"
            key={opt.value}
            aria-pressed={analysisMode === opt.value}
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

      {setPlatform && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 10,
          paddingLeft: 2,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, fontFamily: "var(--font-body)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Platform:
          </span>
          {platformOptions.map((opt) => (
            <button
              type="button"
              key={opt.value}
              aria-pressed={platform === opt.value && !combinedPlatform}
              onClick={() => { setPlatform(opt.value); setCombinedPlatform && setCombinedPlatform(false); }}
              style={{
                background: platform === opt.value && !combinedPlatform
                  ? "linear-gradient(135deg, var(--primary-container), var(--primary-dim))"
                  : "var(--surface-2)",
                border: "1px solid",
                borderColor: platform === opt.value && !combinedPlatform ? "var(--primary-container)" : "var(--outline)",
                color: platform === opt.value && !combinedPlatform ? "var(--on-primary)" : "var(--text-muted)",
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                fontFamily: "var(--font-body)",
                letterSpacing: "0.08em",
                boxShadow: platform === opt.value && !combinedPlatform ? "0 0 16px var(--primary-glow)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
          {setCombinedPlatform && (
            <button
              type="button"
              aria-pressed={combinedPlatform}
              onClick={() => setCombinedPlatform(!combinedPlatform)}
              style={{
                background: combinedPlatform
                  ? "linear-gradient(135deg, var(--primary-container), var(--primary-dim))"
                  : "var(--surface-2)",
                border: "1px solid",
                borderColor: combinedPlatform ? "var(--primary-container)" : "var(--outline)",
                color: combinedPlatform ? "var(--on-primary)" : "var(--text-muted)",
                padding: "6px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                fontFamily: "var(--font-body)",
                letterSpacing: "0.08em",
                boxShadow: combinedPlatform ? "0 0 16px var(--primary-glow)" : "none",
              }}
            >
              Both
            </button>
          )}
        </div>
      )}

    </div>
  );
}

