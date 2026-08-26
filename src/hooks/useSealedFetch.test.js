import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useSealedFetch } from "./useSealedFetch";

describe("useSealedFetch", () => {
  it("exposes fetched data + note through the sealed shape", async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: { points: [1] }, note: "cached" });
    const { result } = renderHook(() => useSealedFetch(fetcher, true));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.data).toEqual({ points: [1] });
    expect(result.current.note).toBe("cached");
    expect(result.current.error).toBe("");
  });

  it("swallows AbortError but surfaces other failures", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetcher = vi.fn()
      .mockRejectedValueOnce(abortErr)
      .mockRejectedValueOnce(new Error("backend down"));
    const { result } = renderHook(() => useSealedFetch(fetcher, true));
    await waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(1); });
    // AbortError → sealed silence: no error state
    expect(result.current.error).toBe("");
    // Real failure → surfaced via retry
    act(() => result.current.retry());
    await waitFor(() => { expect(result.current.error).toBe("backend down"); });
    expect(result.current.data).toBeNull();
  });

  it("skips the fetch entirely while enabled is false, starts when it flips true", async () => {
    const fetcher = vi.fn().mockResolvedValue({ data: 1 });
    const { result, rerender } = renderHook(({ enabled }) => useSealedFetch(fetcher, enabled), {
      initialProps: { enabled: false },
    });
    expect(fetcher).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(1); });
    expect(result.current.data).toBe(1);
  });

  it("refetches when the fetcher identity changes (platform switch)", async () => {
    const first = vi.fn().mockResolvedValue({ data: "cf" });
    const second = vi.fn().mockResolvedValue({ data: "lc" });
    const { result, rerender } = renderHook(({ f }) => useSealedFetch(f, true), {
      initialProps: { f: first },
    });
    await waitFor(() => { expect(result.current.data).toBe("cf"); });
    rerender({ f: second });
    await waitFor(() => { expect(result.current.data).toBe("lc"); });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  // NOTE on falsifiability: teardown races are asserted while MOUNTED (via an
  // enabled=false rerender, whose cleanup aborts through the same controller
  // ref slot as unmount). Post-unmount result.current is frozen in React 18 —
  // assertions made after unmount() pass even against the pre-guard buggy
  // hook, so they can't catch a regression.
  it("does not commit a stale resolve when disabled mid-flight (aborted run dropped)", async () => {
    let resolveLate;
    const fetcher = vi.fn().mockReturnValue(new Promise((r) => { resolveLate = r; }));
    const { result, rerender } = renderHook(({ enabled }) => useSealedFetch(fetcher, enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(1); });
    rerender({ enabled: false });
    // Derived loading flips false instantly with the disable — no reset
    // setState needed (ActivityHeatmap has no disabled branch to hide behind).
    expect(result.current.loading).toBe(false);
    resolveLate({ data: "stale" });
    await act(async () => {});
    expect(result.current.data).toBeNull();
  });

  it("does not surface a non-AbortError rejection when disabled mid-flight", async () => {
    let rejectLate;
    const fetcher = vi.fn().mockReturnValue(new Promise((_, rej) => { rejectLate = rej; }));
    const { result, rerender } = renderHook(({ enabled }) => useSealedFetch(fetcher, enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(1); });
    rerender({ enabled: false });
    rejectLate(new TypeError("Failed to fetch"));
    await act(async () => {});
    expect(result.current.error).toBe("");
  });

  it("retry issues a fresh controller per attempt", async () => {
    const signals = [];
    const fetcher = vi.fn(async (signal) => {
      signals.push(signal);
      return { data: signals.length };
    });
    const { result } = renderHook(() => useSealedFetch(fetcher, true));
    await waitFor(() => { expect(signals.length).toBe(1); });
    act(() => result.current.retry());
    await waitFor(() => { expect(signals.length).toBe(2); });
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[1].aborted).toBe(false);
  });
});
