// Greenhouse Phase 5b — localStorage-first store for saved plans (spec §5.2 #9).
// No DB row → seeded from localStorage; no localStorage → blank checklist state,
// never an error. Keyed per handle so different users never see each other's plans.
const keyOf = (handle) => `cpcoach.plans.${(handle || "").trim()}`;

export function loadLocalPlans(handle) {
  try {
    const raw = window.localStorage.getItem(keyOf(handle));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalPlans(handle, plans) {
  try {
    window.localStorage.setItem(keyOf(handle), JSON.stringify(plans));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalPlans(handle) {
  try {
    window.localStorage.removeItem(keyOf(handle));
  } catch {
    /* ignore quota/private-mode errors */
  }
}