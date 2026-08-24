// Greenhouse Phase 5b — Workbook dashboard section (spec §5.2 #9).
// Saved-plan checklists backed by the plans CRUD route (the only DB change in the
// program), localStorage-first: DB rows → fallback localStorage seed → blank
// checklist state, never an error. "Save current recommendations" snapshots the
// active recs + weak focus + mastery snapshot as a reproducible plan (§5b lock #7).
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { BookIcon } from "./Icons";
import { showToast } from "./ToastContainer.jsx";
import { useAnalysisContext } from "../hooks/AnalysisContext.jsx";
import { getPlans, createPlan, updatePlan, deletePlan } from "../api/backendClient.js";
import { loadLocalPlans, saveLocalPlans } from "../lib/workbookStore.js";
import { panelTransition } from "../lib/motion.js";

const nextId = (() => { let n = 0; return () => `local-${Date.now()}-${n++}`; })();

export default function Workbook() {
  const { primaryHandle, recommendations, weakTags, masteryScoresRef } = useAnalysisContext();
  const handle = primaryHandle;
  const [plans, setPlans] = useState(null);       // null = not loaded yet
  const [error, setError] = useState("");
  const [localOnly, setLocalOnly] = useState(false);

  const run = useCallback(async (controller) => {
    setError("");
    try {
      const data = await getPlans(handle.trim(), controller.signal);
      if (data && data.length > 0) {
        setPlans(data);
        setLocalOnly(false);
        saveLocalPlans(handle, data);
        return;
      }
      const local = loadLocalPlans(handle);
      setPlans(local && local.length > 0 ? local : []);
      setLocalOnly(Boolean(local && local.length > 0));
    } catch (err) {
      if (err.name === "AbortError") return;
      const local = loadLocalPlans(handle);
      if (local && local.length > 0) {
        setPlans(local);
        setLocalOnly(true);
      } else {
        setPlans([]);
      }
      setError(err.message || "Failed to load saved plans — showing local copy.");
    }
  }, [handle]);

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => { await run(controller); if (cancelled) setPlans((p) => (p === null ? [] : p)); })();
    return () => { cancelled = true; controller.abort(); };
  }, [handle, run]);

  const syncLocal = (nextPlans) => {
    setPlans(nextPlans);
    saveLocalPlans(handle, nextPlans);
  };

  // Mastery snapshot read directly from the context ref (SkillFrontier pattern).
  // eslint-disable-next-line react-hooks/refs
  const masterySnapshot = (masteryScoresRef && masteryScoresRef.current) || {};

  const saveCurrent = async () => {
    if (!recommendations || recommendations.length === 0) {
      showToast("No active recommendations to save.", "info");
      return;
    }
    const payload = {
      items: recommendations.map((r) => ({
        problem_id: r.problem_id, name: r.name || r.problem_id, platform: r.platform,
        difficulty: r.difficulty ?? null, topics: r.topics || [],
        url: r.url || "", done: false,
      })),
      focus_topics: (weakTags || []).map((t) => t.tag),
      mastery_snapshot: masterySnapshot,
      saved_at: new Date().toISOString(),
    };
    const name = `Week of ${new Date().toISOString().slice(0, 10)}`;
    const tempId = nextId();
    const current = plans || [];
    syncLocal([{ id: tempId, name, payload, created_at: null, updated_at: null }, ...current]);
    try {
      const created = await createPlan(handle.trim(), { name, payload });
      syncLocal([created, ...current]);
      showToast(`Saved "${name}".`, "success");
    } catch {
      setLocalOnly(true);
      showToast("Saved locally only — backend storage unavailable.", "error");
    }
  };

  const toggleDone = async (planId, itemIndex, done) => {
    const plan = (plans || []).find((p) => String(p.id) === String(planId));
    if (!plan) return;
    const items = (plan.payload.items || []).map((it, i) =>
      i === itemIndex ? { ...it, done } : it);
    const next = { ...plan, payload: { ...plan.payload, items } };
    syncLocal((plans || []).map((p) => (String(p.id) === String(planId) ? next : p)));
    if (String(planId).startsWith("local-")) return;
    try {
      await updatePlan(handle.trim(), planId, { name: plan.name, payload: next.payload });
    } catch {
      setLocalOnly(true);
      showToast("Checklist saved locally — sync will retry.", "error");
    }
  };

  const rename = async (planId, name) => {
    const plan = (plans || []).find((p) => String(p.id) === String(planId));
    if (!plan) return;
    const next = { ...plan, name };
    syncLocal((plans || []).map((p) => (String(p.id) === String(planId) ? next : p)));
    if (String(planId).startsWith("local-")) return;
    try {
      await updatePlan(handle.trim(), planId, { name, payload: next.payload });
      showToast("Plan renamed.", "success");
    } catch {
      setLocalOnly(true);
      showToast("Rename saved locally only.", "error");
    }
  };

  const removePlan = async (planId) => {
    const plan = (plans || []).find((p) => String(p.id) === String(planId));
    if (!plan) return;
    const remaining = (plans || []).filter((p) => String(p.id) !== String(planId));
    syncLocal(remaining);
    if (String(planId).startsWith("local-")) return;
    try {
      await deletePlan(handle.trim(), planId);
      showToast(`Deleted "${plan.name}".`, "success");
    } catch {
      setLocalOnly(true);
      showToast("Delete saved locally only.", "error");
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={panelTransition}>
      <div className="card dash-workbook" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "linear-gradient(135deg, var(--primary-container), var(--primary-dim))", borderRadius: "var(--radius-sm)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--on-primary)", flexShrink: 0 }}>
              <BookIcon size={16} />
            </div>
            <div className="font-heading" style={{ fontWeight: 600, fontSize: 18, color: "#ffffff", letterSpacing: "-0.01em" }}>Workbook</div>
          </div>
          <button className="btn-primary" data-testid="wb-save" onClick={saveCurrent} style={{ padding: "8px 16px", fontSize: 13 }}>
            Save current recommendations
          </button>
        </div>

        {plans === null && (
          <div data-testid="wb-loading" style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading saved plans…</div>
        )}

        {plans !== null && plans.length === 0 && (
          <p data-testid="wb-blank" style={{ fontSize: 13, color: "var(--on-surface-variant)", margin: 0, lineHeight: 1.6 }}>
            {`No saved plans yet — run an analysis and hit "Save current recommendations" to start a practice checklist.`}
          </p>
        )}

        {plans !== null && plans.length > 0 && (
          <div>
            <p data-testid="wb-summary" style={{ fontSize: 13, color: "var(--on-surface-variant)", lineHeight: 1.6, margin: "0 0 12px" }}>
              <strong style={{ color: "var(--on-surface)" }}>{plans.length}</strong> saved plan{plans.length === 1 ? "" : "s"} for {handle}
              {localOnly && <span data-testid="wb-local-note" style={{ color: "var(--warning)" }}> — saved locally only</span>}
              {error && <span data-testid="wb-error" style={{ color: "var(--warning)", marginLeft: 8 }}> {error}</span>}
            </p>
            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onToggleDone={toggleDone} onRename={rename} onDelete={removePlan} />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PlanCard({ plan, onToggleDone, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.name);
  const items = plan.payload.items || [];

  const commitRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== plan.name) onRename(plan.id, trimmed);
    setEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete plan "${plan.name}"?`)) onDelete(plan.id);
  };

  return (
    <div data-testid="wb-plan" data-plan-id={plan.id} style={{ marginBottom: 10, padding: "12px 14px", background: "var(--surface-2)", borderRadius: "var(--radius-sm)", border: "1px solid var(--outline-variant)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: items.length > 0 ? 8 : 0, flexWrap: "wrap" }}>
        {editing ? (
          <>
            <input data-testid="wb-rename-input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }} autoFocus style={{ padding: "5px 8px", fontSize: 13, fontFamily: "var(--font-mono)", background: "var(--surface-1)", border: "1px solid var(--outline-variant)", borderRadius: "var(--radius-sm)", color: "var(--on-surface)", flex: "1 1 160px" }} />
            <button className="btn-primary" data-testid="wb-rename-save" onClick={commitRename} style={{ padding: "6px 12px", fontSize: 12 }}>Save</button>
          </>
        ) : (
          <>
            <span data-testid="wb-plan-name" style={{ fontSize: 14, fontWeight: 600, color: "var(--on-surface)", fontFamily: "var(--font-mono)" }}>{plan.name}</span>
            <button data-testid="wb-rename" onClick={() => setEditing(true)} style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-accent-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>rename</button>
          </>
        )}
        <button data-testid="wb-delete" onClick={handleDelete} style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--error)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>delete</button>
      </div>
      <div data-testid="wb-checklist">
        {items.map((it, i) => (
          <label key={`${it.problem_id}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: "var(--on-surface-variant)", cursor: "pointer" }}>
            <input
              type="checkbox"
              data-testid="wb-check"
              checked={Boolean(it.done)}
              onChange={(e) => onToggleDone(plan.id, i, e.target.checked)}
              style={{ accentColor: "var(--color-accent)" }}
            />
            <span style={{ textDecoration: it.done ? "line-through" : "none", opacity: it.done ? 0.55 : 1 }}>{it.name}</span>
          </label>
        ))}
        {items.length === 0 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>empty checklist</span>}
      </div>
    </div>
  );
}