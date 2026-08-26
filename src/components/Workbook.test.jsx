import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { waitFor, fireEvent } from "@testing-library/react";
import Workbook from "./Workbook.jsx";
import { renderInContext } from "../__fixtures__/analysisContext.jsx";
import { loadLocalPlans } from "../lib/workbookStore.js";

const originalFetch = globalThis.fetch;
const originalConfirm = globalThis.confirm;
beforeEach(() => {
  globalThis.fetch = vi.fn();
  globalThis.confirm = () => true;
  window.localStorage.clear();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.confirm = originalConfirm;
  window.localStorage.clear();
});

const PLANS = [
  {
    id: 1, name: "Week of 2026-08-10",
    payload: { items: [{ problem_id: "cf-1234A", name: "Binary Search Walk", platform: "cf", difficulty: 1500, topics: ["binary_search"], url: "", done: false }] },
    created_at: "2026-08-10T00:00:00Z", updated_at: "2026-08-10T00:00:00Z",
  },
  {
    id: 2, name: "Week of 2026-08-03",
    payload: { items: [{ problem_id: "cf-1234B", name: "Bitmask Count", platform: "cf", difficulty: 1700, topics: ["bitmasks"], url: "", done: true }] },
    created_at: "2026-08-03T00:00:00Z", updated_at: "2026-08-03T00:00:00Z",
  },
];

function okResponse(body) {
  return { ok: true, json: () => Promise.resolve(body) };
}

function err400() {
  return {
    ok: false,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ detail: "backend down" }),
  };
}

// Method-aware mock: GET → plans list, POST → created plan, PUT → updated, DELETE → ok.
function mockApi(plans) {
  globalThis.fetch.mockImplementation((url, options = {}) => {
    const method = options.method || "GET";
    if (method === "GET") return Promise.resolve(okResponse(plans));
    if (method === "POST") {
      const body = JSON.parse(options.body);
      return Promise.resolve(okResponse({ id: 99, ...body, created_at: "2026-08-15T00:00:00Z", updated_at: "2026-08-15T00:00:00Z" }));
    }
    if (method === "PUT") return Promise.resolve(okResponse({}));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ deleted: true }) });
  });
}

async function loaded(container) {
  await waitFor(() => {
    expect(container.querySelectorAll("[data-testid='wb-plan']").length).toBeGreaterThan(0);
  });
}

describe("Workbook — §5.2 #9", () => {
  it("renders the saved-plan list from the backend", async () => {
    mockApi(PLANS);
    const { container, getByTestId } = renderInContext(<Workbook />);
    await loaded(container);
    expect(getByTestId("wb-summary").textContent).toContain("2");
    expect(getByTestId("wb-summary").textContent).toContain("mannpatel");
    expect(container.querySelectorAll("[data-testid='wb-plan']").length).toBe(2);
  });

  it("blank checklist state when backend returns [] and no local copy", async () => {
    mockApi([]);
    const { getByTestId } = renderInContext(<Workbook />);
    await waitFor(() => { expect(getByTestId("wb-blank")).toBeTruthy(); });
  });

  it("Save button POSTs the current recommendations as a plan payload", async () => {
    mockApi([]);
    const { getByTestId } = renderInContext(<Workbook />);
    await waitFor(() => { expect(getByTestId("wb-blank")).toBeTruthy(); });
    fireEvent.click(getByTestId("wb-save"));
    await waitFor(() => {
      const post = globalThis.fetch.mock.calls.find(([, o]) => (o?.method || "GET") === "POST");
      expect(post).toBeTruthy();
    });
    const post = globalThis.fetch.mock.calls.find(([, o]) => (o?.method || "GET") === "POST");
    const body = JSON.parse(post[1].body);
    expect(body.name).toContain("Week of");
    expect(body.payload.items.length).toBe(2); // fixture recommendations
    expect(body.payload.items[0].name).toBe("Binary Search Walk");
    expect(body.payload.focus_topics).toContain("binary_search");
    expect(body.payload.mastery_snapshot.binary_search).toBe(0.2);
  });

  it("seeds from localStorage when the backend read fails (fallback, never error)", async () => {
    globalThis.fetch.mockResolvedValue(err400());
    window.localStorage.setItem("cpcoach.plans.mannpatel", JSON.stringify(PLANS));
    const { container, getByTestId } = renderInContext(<Workbook />);
    await loaded(container);
    expect(getByTestId("wb-local-note")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='wb-plan']").length).toBe(2);
  });

  it("toggling a checkbox PUTs the updated payload and writes localStorage", async () => {
    mockApi(PLANS);
    const { container } = renderInContext(<Workbook />);
    await loaded(container);
    const checks = container.querySelectorAll("[data-testid='wb-check']");
    expect(checks.length).toBe(2);
    fireEvent.click(checks[0]);
    await waitFor(() => {
      const put = globalThis.fetch.mock.calls.find(([, o]) => (o?.method || "GET") === "PUT");
      expect(put).toBeTruthy();
    });
    const put = globalThis.fetch.mock.calls.find(([, o]) => (o?.method || "GET") === "PUT");
    expect(put[0]).toContain("/api/plans/mannpatel/1");
    const body = JSON.parse(put[1].body);
    expect(body.payload.items[0].done).toBe(true);
    const local = loadLocalPlans("mannpatel");
    expect(local.find((p) => p.id === 1).payload.items[0].done).toBe(true);
  });

  it("rename PUTs the new name + payload and syncs localStorage", async () => {
    mockApi(PLANS);
    const { container } = renderInContext(<Workbook />);
    await loaded(container);

    // Enter edit mode on plan 1, change the name, commit via Save.
    fireEvent.click(container.querySelectorAll("[data-testid='wb-rename']")[0]);
    const input = container.querySelector("[data-testid='wb-rename-input']");
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: "Renamed plan" } });
    fireEvent.click(container.querySelector("[data-testid='wb-rename-save']"));

    await waitFor(() => {
      const put = globalThis.fetch.mock.calls.find(([, o]) => (o?.method || "GET") === "PUT");
      expect(put).toBeTruthy();
    });
    const put = globalThis.fetch.mock.calls.find(([, o]) => (o?.method || "GET") === "PUT");
    expect(put[0]).toContain("/api/plans/mannpatel/1");
    const body = JSON.parse(put[1].body);
    expect(body.name).toBe("Renamed plan");
    // Rename shares updatePlan with toggleDone — the payload must ride along.
    expect(body.payload.items.length).toBe(1);
    expect(loadLocalPlans("mannpatel").find((p) => p.id === 1).name).toBe("Renamed plan");
  });

  it("rename with an unchanged name does not fire a PUT", async () => {
    mockApi(PLANS);
    const { container } = renderInContext(<Workbook />);
    await loaded(container);

    fireEvent.click(container.querySelectorAll("[data-testid='wb-rename']")[0]);
    fireEvent.click(container.querySelector("[data-testid='wb-rename-save']"));

    await new Promise((r) => setTimeout(r, 20));
    expect(globalThis.fetch.mock.calls.some(([, o]) => (o?.method || "GET") === "PUT")).toBe(false);
  });

  it("delete removes the plan from the list and calls DELETE", async () => {
    mockApi(PLANS);
    const { container } = renderInContext(<Workbook />);
    await loaded(container);
    const deletes = container.querySelectorAll("[data-testid='wb-delete']");
    fireEvent.click(deletes[0]);
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.some(([, o]) => (o?.method || "GET") === "DELETE")).toBe(true);
    });
    expect(container.querySelectorAll("[data-testid='wb-plan']").length).toBe(1);
  });

  it("write-failure contract: failed POST keeps the optimistic local copy + local-only note", async () => {
    // Read succeeds empty; every write 5xxes (backend plans storage down).
    globalThis.fetch.mockImplementation((url, options = {}) => {
      if ((options.method || "GET") === "GET") return Promise.resolve(okResponse([]));
      return Promise.resolve({
        ok: false, status: 502,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ detail: "Plans storage unavailable." }),
      });
    });
    const { getByTestId } = renderInContext(<Workbook />);
    await waitFor(() => { expect(getByTestId("wb-blank")).toBeTruthy(); });

    fireEvent.click(getByTestId("wb-save"));

    // apiFetch retries the 502 twice with backoff before the catch fires —
    // give the optimistic-copy assertion room to outlive the retry ladder.
    await waitFor(() => { expect(getByTestId("wb-local-note")).toBeTruthy(); }, { timeout: 6000 });
    expect(getByTestId("wb-plan")).toBeTruthy();
    expect(getByTestId("wb-local-note")).toBeTruthy();
    // The optimistic copy is durable in localStorage keyed by handle — a reload
    // must not lose the plan the user thinks they saved.
    expect(loadLocalPlans("mannpatel").length).toBe(1);
    expect(loadLocalPlans("mannpatel")[0].payload.items.length).toBeGreaterThan(0);
  });
});