import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useCompareHandle from "./useCompareHandle";
import { analyzeHandle } from "../api/backendClient.js";

vi.mock("../api/backendClient.js", () => ({ analyzeHandle: vi.fn() }));

const originalFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = vi.fn();
  vi.mocked(analyzeHandle).mockReset();
});
afterEach(() => { globalThis.fetch = originalFetch; });

describe("useCompareHandle", () => {
  // Teardown-race regression, asserted while MOUNTED (post-unmount state is
  // frozen in React 18, so assertions after unmount() can't fail — see the
  // note in useSealedFetch.test.js). A superseding run() aborts run 1's
  // controller via resetAbort; an aborted fetch can surface as a
  // non-AbortError TypeError, and the catch path must drop it silently
  // instead of setError-ing over run 2's good result.
  it("does not setError when a superseded run rejects with non-AbortError after its abort", async () => {
    let call = 0;
    vi.mocked(analyzeHandle).mockImplementation((_h, _p, _m, signal) => {
      call += 1;
      if (call === 1) {
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => reject(new TypeError("Failed to fetch")));
        });
      }
      return Promise.resolve({
        handle: "second", platform: "cf", model_used: "graph_dkt",
        mastery_scores: { dp: 0.5 }, topic_profile: [],
      });
    });
    const { result } = renderHook(() => useCompareHandle());
    await act(async () => { result.current.run("first", "cf"); });
    await act(async () => { result.current.run("second", "cf"); });
    await act(async () => {});
    expect(analyzeHandle).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe("");
    expect(result.current.result?.handle).toBe("second");
    expect(result.current.loading).toBe(false);
  });
});
