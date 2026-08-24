// Greenhouse Phase 4b — MasteryHistory dashboard section (spec §5.2 #6).
// Graph-DKT only: rule_based paths render a disabled card with a caption (§8 —
// rule-based mastery must never be presented as Graph-DKT output). Hand-built
// SVG sparklines (spec §13.3), self-fetching with sealed empty-state + retry.
// Reduced-motion is CSS-only in this repo — no JS matchMedia needed (§8).
// Platform is threaded explicitly so the read route resolves the user by the
// SAME handle column the analyze wrote to.
import { useCallback } from "react";
import { motion } from "framer-motion";
import { ZapIcon } from "./Icons";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import { useSealedFetch } from "../hooks/useSealedFetch.js";
import { getMasteryHistory } from "../api/backendClient.js";
import { panelTransition } from "../lib/motion.js";
import { labelOf } from "../lib/topicGraphLayout.js";

const SPARK_W = 140;
const SPARK_H = 30;
const MAX_ROWS = 8;

export default function MasteryHistory() {
  const { modelUsed, primaryHandle, primaryPlatform } = useAnalysisContext();

  const handle = primaryHandle;
  const platform = primaryPlatform;
  const graphDkt = modelUsed === "graph_dkt";

  const fetcher = useCallback(async (signal) => {
    const data = await getMasteryHistory(handle.trim(), signal, platform);
    return { data: data.mastery_history || null, note: data.note || "" };
  }, [handle, platform]);

  // Skipped entirely when the rule-based badge applies.
  const { data: history, note, error, loading, retry } = useSealedFetch(fetcher, graphDkt && !!handle);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
      <div className="card dash-mastery" style={{ padding: 24 }}>
        <div className="dash-mastery-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
            <ZapIcon size={16} />
          </div>
          <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Mastery history</div>
          {!graphDkt && (
            <span data-testid="mastery-disabled-badge" style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--warning)", background: "var(--warning-container)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: "var(--radius-full)", padding: "3px 8px" }}>
              estimate · not graph-dkt
            </span>
          )}
        </div>

        {!graphDkt ? (
          <p data-testid="mastery-disabled" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: 0 }}>
            Mastery history requires the Graph-DKT model — the rule-based estimate has no per-timestep checkpoints.
          </p>
        ) : loading && !history && !error ? (
          <div data-testid="mastery-loading" style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading mastery history…</div>
        ) : error ? (
          <div data-testid="mastery-error" style={{ padding: "18px 0", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: "0 0 12px" }}>{error}</p>
            <button className="btn-primary" data-testid="mastery-retry" onClick={retry} style={{ padding: "8px 18px", fontSize: 13 }}>
              Retry
            </button>
          </div>
        ) : !history ? (
          <p data-testid="mastery-note" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: 0 }}>
            {note || "No mastery history yet — run a deep analyze while Graph-DKT is loaded."}
          </p>
        ) : (
          <MasterySparklines history={history} />
        )}
      </div>
    </motion.div>
  );
}

function MasterySparklines({ history }) {
  const entries = Object.entries(history).filter(([, cps]) => cps && cps.length > 1);
  // Top rows by variance (range of p) — topics that actually moved across time
  const ranked = entries
    .sort((a, b) => spanOf(b[1]) - spanOf(a[1]))
    .slice(0, MAX_ROWS);

  const strongest = ranked[0]?.[0] ?? null;
  const weakest = ranked[ranked.length - 1]?.[0] ?? null;
  const nTopics = Object.keys(history).length;
  const nCps = ranked[0]?.[1].length ?? 0;

  if (ranked.length === 0) {
    return <p data-testid="mastery-note" style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: 0 }}>No topic curves yet — run a deep analyze while Graph-DKT is loaded.</p>;
  }

  return (
    <div>
      {/* §9 sibling summary — nothing image-only */}
      <p data-testid="mastery-summary" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: "0 0 12px" }}>
        Mastery trajectory across <strong style={{ color: "var(--on-surface)" }}>{nCps}</strong> checkpoints for{" "}
        <strong style={{ color: "var(--on-surface)" }}>{nTopics}</strong> topics — top movers:
        strongest <strong style={{ color: "var(--color-accent-text)" }}>{labelOf(strongest)}</strong>, weakest{" "}
        <strong style={{ color: "var(--color-accent-text)" }}>{labelOf(weakest)}</strong>.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ranked.map(([topic, cps]) => (
          <div key={topic} data-testid="mastery-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 170, flexShrink: 0, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--on-surface-variant)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{labelOf(topic)}</span>
            <Sparkline cps={cps} />
          </div>
        ))}
      </div>
    </div>
  );
}

function spanOf(cps) {
  const ps = cps.map((c) => c.p);
  return Math.max(...ps) - Math.min(...ps);
}

function Sparkline({ cps }) {
  const ps = cps.map((c) => c.p);
  const min = Math.min(...ps);
  const span = Math.max(Math.max(...ps) - min, 0.0001);
  const n = ps.length;
  const xOf = (i) => (i * (SPARK_W - 2)) / Math.max(n - 1, 1);
  const yOf = (p) => 2 + (1 - (p - min) / span) * (SPARK_H - 4);
  const line = ps.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p).toFixed(1)}`).join(" ");
  const lastP = ps[n - 1];
  return (
    <svg data-testid="mastery-sparkline" viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} style={{ width: "100%", maxWidth: SPARK_W, height: SPARK_H, display: "block", flexShrink: 0 }}>
      <path d={line} fill="none" stroke="var(--color-accent)" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xOf(n - 1)} cy={yOf(lastP)} r={2.4} fill="var(--color-accent)" stroke="var(--surface-base)" strokeWidth={1} />
    </svg>
  );
}