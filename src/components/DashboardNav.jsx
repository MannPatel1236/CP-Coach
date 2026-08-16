// Greenhouse Phase 6 — DashboardNav (spec plan 2026-08-16, Step 2).
// Sticky WAI-ARIA tablist under the search bar. Roving tabindex + wrap-around
// arrow keys (Left/Right/Home/End), auto-activation on arrow navigation, and a
// framer-motion layoutId pill as the active indicator. Panels stay permanently
// mounted — this nav only switches visibility.
import { motion } from "framer-motion";
import { TargetIcon, TrendUpIcon, UserIcon, BookIcon } from "./Icons";

export const DASH_TABS = [
  { id: "practice", label: "Practice & Frontier", Icon: TargetIcon },
  { id: "analytics", label: "Analytics & Progress", Icon: TrendUpIcon },
  { id: "compare", label: "Compare", Icon: UserIcon },
  { id: "workbook", label: "Workbook", Icon: BookIcon },
];

export default function DashboardNav({ activeTab, onSelectTab }) {
  const handleKeyDown = (e) => {
    const idx = DASH_TABS.findIndex((t) => t.id === activeTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % DASH_TABS.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + DASH_TABS.length) % DASH_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = DASH_TABS.length - 1;
    if (next === -1) return;
    e.preventDefault();
    const tab = DASH_TABS[next];
    onSelectTab(tab.id);
    document.getElementById(`tab-${tab.id}`)?.focus();
  };

  return (
    <nav role="tablist" aria-label="Dashboard views" className="dash-nav-container" onKeyDown={handleKeyDown} data-testid="dash-nav">
      {DASH_TABS.map(({ id, label, Icon }) => {
        const isActive = activeTab === id;
        return (
          <button
            key={id}
            id={`tab-${id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${id}`}
            tabIndex={isActive ? 0 : -1}
            className={`dash-nav-item${isActive ? " is-active" : ""}`}
            onClick={() => onSelectTab(id)}
            data-testid={`nav-tab-${id}`}
          >
            <Icon size={14} />
            <span>{label}</span>
            {isActive && <motion.span layoutId="active-nav-pill" className="dash-nav-pill" />}
          </button>
        );
      })}
    </nav>
  );
}