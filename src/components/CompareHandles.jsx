// Greenhouse Phase 5a — CompareHandles dashboard section (spec §5.2 #8).
// Two-handle solvedSet/mastery diff via useCompareHandle (localized secondary
// analysis — never in primary context). Fallback: either handle fails → show the
// resolved side + "second handle unavailable" chip; rule_based mastery on either
// side is badged per §8 before diff coloring. Sibling text summary (§9).
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { UserIcon } from "./Icons";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import useCompareHandle from "../hooks/useCompareHandle.js";
import { labelOf } from "../lib/topicGraphLayout.js";
import { panelTransition } from "../lib/motion.js";

const LEAD_DELTA = 0.05;

export default function CompareHandles() {
  const { cfHandle, lcHandle, user, cfUser, lcUser, masteryScoresRef, solvedSet, modelUsed } = useAnalysisContext();
  const { target, result, loading, error, run, clear } = useCompareHandle();
  const primaryCmp = useCompareHandle();
  const [input, setInput] = useState("");
  const [lcInput, setLcInput] = useState("");
  const [pCfInput, setPCfInput] = useState("");
  const [pLcInput, setPLcInput] = useState("");
  const primaryPlatform = cfUser ? "cf" : lcUser ? "lc" : user?.platform === "lc" ? "lc" : "cf";
  const [platform, setPlatform] = useState(primaryPlatform);
  const primaryLabel = cfHandle || lcHandle || user?.handle || "";
  const secondaryPlatform = platform;

  // In "both" mode the PRIMARY side also gets cf/lc inputs, prefilled from the
  // analyzed context (editable — e.g. when the primary was analyzed cf-only).
  useEffect(() => {
    if (platform !== "both") return;
    /* eslint-disable react-hooks/set-state-in-effect -- intentional one-way prefill from the analyzed context when entering both-mode */
    setPCfInput((v) => v || (cfHandle || user?.handle?.split(" / ")[0] || ""));
    setPLcInput((v) => v || (lcHandle || ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [platform, cfHandle, lcHandle, user]);

  // Primary mastery read directly from the context ref (same pattern as SkillFrontier):
  // useAnalysis mutates masteryScoresRef immediately before setModelUsed() → the paired
  // state flip re-renders with fresh mastery, so the ref is current at render time.
  // eslint-disable-next-line react-hooks/refs
  const primaryMastery = (masteryScoresRef && masteryScoresRef.current) || {};
  const primarySolved = solvedSet || new Set();
  const primarySide = (() => {
    if (platform === "both" && primaryCmp.result) {
      // Fetched platforms override the context refs; empty platforms fall back to
      // the analyzed context (e.g. cf-only primary + freshly typed LC handle).
      return {
        handle: primaryCmp.result.handle,
        mastery: { ...primaryMastery, ...primaryCmp.result.mastery },
        solvedSet: new Set([...primarySolved, ...primaryCmp.result.solvedSet]),
        modelUsed: primaryCmp.result.modelUsed,
      };
    }
    return { handle: primaryLabel, mastery: primaryMastery, solvedSet: primarySolved, modelUsed };
  })();
  // eslint-disable-next-line react-hooks/refs -- ref-tainted via primarySide.mastery; same intentional pattern as primaryMastery above
  const isEstimate = primarySide.modelUsed !== "graph_dkt" || (result && result.modelUsed !== "graph_dkt");
  const isLoading = platform === "both" ? loading || primaryCmp.loading : loading;
  const activeError = platform === "both" ? error || primaryCmp.error : error;
  const resetAll = () => {
    clear();
    primaryCmp.clear();
  };

  if (!import.meta.env.VITE_API_URL) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
        <div className="card dash-compare" style={{ padding: 24 }}>
          <CompareHeader />
          <p data-testid="compare-disabled" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: 0 }}>
            Compare requires the backend service.
          </p>
        </div>
      </motion.div>
    );
  }

  const runCompare = () => {
    if (platform === "both") {
      if (!input.trim() && !lcInput.trim()) return;
      if (pCfInput.trim() || pLcInput.trim()) {
        primaryCmp.run({ cf: pCfInput, lc: pLcInput }, "both");
      } else {
        primaryCmp.clear();
      }
      run({ cf: input, lc: lcInput }, "both");
      return;
    }
    if (!input.trim()) return;
    run(input, secondaryPlatform);
  };

  const inputStyle = { flex: "1 1 150px", minWidth: 110, padding: "7px 10px", fontSize: 13, fontFamily: "var(--font-mono)", background: "var(--surface-1)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-sm)", color: "var(--on-surface)" };
  const chipStyle = { fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--color-accent-text)", background: "var(--surface-2)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-full)", padding: "4px 10px" };

  const onKeyDown = (e) => {
    if (e.key === "Enter") runCompare();
  };

  // Identical in both-mode and single-mode branches — defined once so the
  // selector options and button can't drift apart again (the text inputs
  // above already did, which is why these were hoisted).
  const platformSelect = (
    <select
      data-testid="compare-platform"
      value={platform}
      onChange={(e) => setPlatform(e.target.value)}
      style={{ padding: "7px 8px", fontSize: 12, fontFamily: "var(--font-mono)", background: "var(--surface-1)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-sm)", color: "var(--on-surface)" }}
    >
      <option value="cf">cf</option>
      <option value="lc">lc</option>
      <option value="both">cf+lc</option>
    </select>
  );
  const compareButton = (
    <button className="btn-primary" data-testid="compare-analyze" onClick={runCompare} style={{ padding: "7px 16px", fontSize: 13 }}>
      Compare
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
      <div className="card dash-compare" style={{ padding: 24 }}>
        <CompareHeader />

        <div style={platform === "both" ? { display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 } : { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {platform === "both" ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span data-testid="compare-primary" style={chipStyle}>{primaryLabel || "primary"}</span>
                <input
                  data-testid="compare-primary-cf"
                  value={pCfInput}
                  onChange={(e) => setPCfInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="CF handle"
                  style={inputStyle}
                />
                <input
                  data-testid="compare-primary-lc"
                  value={pLcInput}
                  onChange={(e) => setPLcInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="LC handle (optional)"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={chipStyle}>opponent</span>
                <input
                  data-testid="compare-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="CF handle"
                  style={inputStyle}
                />
                <input
                  data-testid="compare-input-lc"
                  value={lcInput}
                  onChange={(e) => setLcInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="LC handle (optional)"
                  style={inputStyle}
                />
                {platformSelect}
                {compareButton}
              </div>
            </>
          ) : (
            <>
              <span data-testid="compare-primary" style={chipStyle}>{primaryLabel || "primary"}</span>
              <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>vs</span>
              <input
                data-testid="compare-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="second handle"
                style={{ flex: "1 1 160px", minWidth: 120, padding: "7px 10px", fontSize: 13, fontFamily: "var(--font-mono)", background: "var(--surface-1)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-sm)", color: "var(--on-surface)" }}
              />
              {platformSelect}
              {compareButton}
            </>
          )}
        </div>

        {isLoading && !result && (
          <div data-testid="compare-loading" style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
            {platform === "both"
              ? `Analyzing ${[pCfInput.trim(), pLcInput.trim(), input.trim(), lcInput.trim()].filter(Boolean).join(" / ") || "handles"}…`
              : `Analyzing ${input || "second handle"}…`}
          </div>
        )}

        {activeError && (
          <div data-testid="compare-unavailable" style={{ padding: "10px 14px", marginBottom: 12, background: "var(--surface-2)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--warning)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--on-surface)" }}>{target || input.trim() || "Second handle"}</strong> unavailable — {activeError}
            </span>
            {result && (
              <button className="btn-primary" data-testid="compare-clear" onClick={resetAll} style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}>
                Reset
              </button>
            )}
          </div>
        )}

        {(() => {
          if (!result) return null;
          // Self-compare: identical handle on both sides would waste a fetch
          // and render a misleading "no shared mastery data" panel — call it
          // out explicitly instead of diffing a profile against itself.
          // eslint-disable-next-line react-hooks/refs -- ref-tainted via primarySide, same intentional pattern as the DiffPanel props below
          const isSelfCompare = (result.handle || "").trim().toLowerCase() === (primarySide.handle || "").trim().toLowerCase();
          return (
            <DiffPanel
              // eslint-disable-next-line react-hooks/refs -- ref-tainted via primarySide (see primaryMastery note)
              primaryLabel={primarySide.handle}
              // eslint-disable-next-line react-hooks/refs
              primaryMastery={primarySide.mastery}
              // eslint-disable-next-line react-hooks/refs
              primarySolved={primarySide.solvedSet}
              secondary={result}
              estimate={isEstimate && !isSelfCompare}
              selfCompare={isSelfCompare}
            />
          );
        })()}
      </div>
    </motion.div>
  );
}

function CompareHeader() {
  return (
    <div className="dash-compare-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
        <UserIcon size={16} />
      </div>
      <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Compare</div>
    </div>
  );
}

function DiffPanel({ primaryLabel, primaryMastery, primarySolved, secondary, estimate, selfCompare }) {
  const aLabel = primaryLabel || "A";
  const bLabel = secondary.handle || "B";

  if (selfCompare) {
    return (
      <p data-testid="compare-self" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: 0 }}>
        That&apos;s the same handle as {aLabel} — enter a different opponent to diff.
      </p>
    );
  }

  const topics = new Set([...Object.keys(primaryMastery), ...Object.keys(secondary.mastery)]);
  const deltas = [];
  for (const t of topics) {
    const a = primaryMastery[t];
    const b = secondary.mastery[t];
    if (a === undefined || b === undefined) continue;
    // delta = primary − secondary → "+" (green) always means the PRIMARY handle leads.
    const delta = a - b;
    if (Math.abs(delta) < 0.001) continue;
    deltas.push({ topic: t, delta });
  }
  deltas.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  const onlyA = [...primarySolved].filter((id) => !secondary.solvedSet.has(id));
  const onlyB = [...secondary.solvedSet].filter((id) => !primarySolved.has(id));

  const leadsA = deltas.filter((d) => d.delta >= LEAD_DELTA).length;
  const leadsB = deltas.filter((d) => d.delta <= -LEAD_DELTA).length;

  const maxAbs = Math.max(0.0001, ...deltas.map((d) => Math.abs(d.delta)));

  return (
    <div>
      {estimate && (
        <span data-testid="compare-estimate-badge" style={{ display: "inline-block", marginBottom: 12, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--warning)", background: "var(--warning-container)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "var(--radius-full)", padding: "3px 8px" }}>
          estimate · not graph-dkt
        </span>
      )}

      <p data-testid="compare-summary" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: "0 0 14px" }}>
        {`${aLabel} leads on ${leadsA} topic${leadsA === 1 ? "" : "s"} by ≥0.05, ${bLabel} leads on ${leadsB}; `}
        {`${aLabel} solved ${onlyA.length} problem${onlyA.length === 1 ? "" : "s"} ${bLabel} hasn't, ${bLabel} solved ${onlyB.length} ${aLabel} hasn't.`}
      </p>

      {deltas.length === 0 ? (
        <p data-testid="compare-no-overlap" style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: 0 }}>
          No shared mastery data to diff (different platforms or empty profiles).
        </p>
      ) : (
        <div data-testid="compare-deltas" style={{ marginBottom: 16 }}>
          {deltas.slice(0, 12).map((d) => {
            const isUp = d.delta > 0;
            return (
              <div key={d.topic} data-testid="compare-delta" data-topic={d.topic} data-delta={d.delta.toFixed(3)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ flex: "0 0 130px", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-accent-text)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(d.topic)}</span>
                <div style={{ flex: 1, height: 8, background: "var(--surface-2)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                  <div
                    data-testid="compare-delta-bar"
                    style={{
                      height: "100%", width: `${Math.min(100, (Math.abs(d.delta) / maxAbs) * 100)}%`,
                      background: isUp ? "var(--success)" : "var(--error)", opacity: 0.85,
                    }}
                  />
                </div>
                <span style={{ flex: "0 0 52px", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: isUp ? "var(--success)" : "var(--error)" }}>
                  {isUp ? "+" : "−"}{Math.abs(d.delta).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px", padding: "10px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--outline-variant)" }}>
          <div className="label-caps" style={{ marginBottom: 6 }}>Solved by {aLabel}, not {bLabel}</div>
          <div data-testid="compare-exclusive-a" style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--on-surface)", lineHeight: 1.7 }}>
            {onlyA.length === 0 ? <span style={{ color: "var(--text-muted)" }}>none</span> : <span>{onlyA.slice(0, 5).join(" · ")}{onlyA.length > 5 ? ` · +${onlyA.length - 5} more` : ""}</span>}
          </div>
        </div>
        <div style={{ flex: "1 1 200px", padding: "10px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--outline-variant)" }}>
          <div className="label-caps" style={{ marginBottom: 6 }}>Solved by {bLabel}, not {aLabel}</div>
          <div data-testid="compare-exclusive-b" style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--on-surface)", lineHeight: 1.7 }}>
            {onlyB.length === 0 ? <span style={{ color: "var(--text-muted)" }}>none</span> : <span>{onlyB.slice(0, 5).join(" · ")}{onlyB.length > 5 ? ` · +${onlyB.length - 5} more` : ""}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}