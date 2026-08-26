import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import DashboardNav, { DASH_TABS } from "./DashboardNav.jsx";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
});

function setup(activeTab = "practice") {
  const onSelectTab = vi.fn();
  const utils = render(<DashboardNav activeTab={activeTab} onSelectTab={onSelectTab} />);
  return { ...utils, onSelectTab };
}

describe("DashboardNav — Phase 6 Step 2", () => {
  it("renders 4 tabs with correct ARIA attributes", () => {
    const { getByRole } = setup();
    const tabs = DASH_TABS.map((t) => getByRole("tab", { name: new RegExp(t.label, "i") }));
    expect(tabs.length).toBe(4);
    tabs.forEach((tab, i) => {
      expect(tab.getAttribute("id")).toBe(`tab-${DASH_TABS[i].id}`);
      expect(tab.getAttribute("aria-controls")).toBe(`panel-${DASH_TABS[i].id}`);
    });
    expect(getByRole("tablist")).toBeTruthy();
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-selected")).toBe("false");
    expect(tabs[0].tabIndex).toBe(0);
    expect(tabs[1].tabIndex).toBe(-1);
  });

  it("clicking a tab fires onSelectTab with the tab id", () => {
    const { getByRole, onSelectTab } = setup("practice");
    fireEvent.click(getByRole("tab", { name: /workbook/i }));
    expect(onSelectTab).toHaveBeenCalledWith("workbook");
  });

  it("ArrowRight/ArrowLeft cycle with wrap-around and auto-activate", () => {
    const { getByRole, onSelectTab } = setup("workbook");
    const tablist = getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(onSelectTab).toHaveBeenLastCalledWith("practice");
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(onSelectTab).toHaveBeenLastCalledWith("compare");
  });

  it("Home/End jump to first/last tab", () => {
    const { getByRole, onSelectTab } = setup("analytics");
    const tablist = getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "Home" });
    expect(onSelectTab).toHaveBeenLastCalledWith("practice");
    fireEvent.keyDown(tablist, { key: "End" });
    expect(onSelectTab).toHaveBeenLastCalledWith("workbook");
  });

  it("non-navigation keys are ignored", () => {
    const { getByRole, onSelectTab } = setup("practice");
    fireEvent.keyDown(getByRole("tablist"), { key: "Tab" });
    expect(onSelectTab).not.toHaveBeenCalled();
  });
});