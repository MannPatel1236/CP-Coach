import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Cold-start retry cadence (backendClient.js). These tests pin the two contracts
// that the UI now depends on: a read detects a woken backend within one short
// poll interval instead of a coarse tick, and it still gives up at ~95s. Writes
// must keep their short budget so a real save failure is reported promptly.

const BASE = "http://backend.test";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  };
}

async function loadClient() {
  vi.stubEnv("VITE_API_URL", BASE);
  vi.resetModules();
  return import("./backendClient.js");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("apiFetch cold-start retries", () => {
  it("retries a read within one 2s poll and resolves as soon as the backend is up", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(502, { detail: "cold start" }))
      .mockResolvedValueOnce(jsonResponse(200, { points: [{ t: 1 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const { getRatingTrajectory } = await loadClient();
    const promise = getRatingTrajectory("tourist", new AbortController().signal);

    // The old ladder waited 5s before its second attempt; the first retry must
    // now land well before that.
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual({ points: [{ t: 1 }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps polling through a long boot and never exceeds the ~95s budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, { detail: "booting" }));
    vi.stubGlobal("fetch", fetchMock);

    const { getProgress } = await loadClient();
    const promise = getProgress("tourist", undefined);
    const settled = expect(promise).rejects.toThrow(/API error 503/);

    await vi.advanceTimersByTimeAsync(600000);
    await settled;

    // 95s budget at a 2s cadence ≈ 48 attempts: patient, but bounded.
    expect(fetchMock.mock.calls.length).toBeGreaterThan(40);
    expect(fetchMock.mock.calls.length).toBeLessThan(60);
  });

  it("does not apply the read budget to writes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(502, { detail: "down" }));
    vi.stubGlobal("fetch", fetchMock);

    const { createPlan } = await loadClient();
    const promise = createPlan("tourist", { title: "x" }, undefined);
    const settled = expect(promise).rejects.toThrow(/API error 502/);

    // 1s + 2s and then bail — a save failure must not hang the UI for 95s.
    await vi.advanceTimersByTimeAsync(5000);
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-5xx responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { detail: "handle not found" }));
    vi.stubGlobal("fetch", fetchMock);

    const { getProgress } = await loadClient();
    const promise = getProgress("nobody", undefined);
    const settled = expect(promise).rejects.toThrow(/handle not found/);

    await vi.advanceTimersByTimeAsync(30000);
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never retries an aborted request", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    const { getProgress } = await loadClient();
    const promise = getProgress("tourist", undefined);
    const settled = expect(promise).rejects.toThrow(/Aborted/);

    await vi.advanceTimersByTimeAsync(30000);
    await settled;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
