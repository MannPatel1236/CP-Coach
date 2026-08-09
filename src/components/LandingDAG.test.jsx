import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import LandingDAG from "./LandingDAG.jsx";

// fetch rejects → FALLBACK_GRAPH (29 nodes / 39 edges). Mirrors SkillFrontier.test.jsx.
// The lib's module-level `inflight` clears on reject (finally + catch) → no cross-test leak.
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = () => Promise.reject(new Error("offline")); });
afterEach(() => { globalThis.fetch = originalFetch; });

// jsdom has no IntersectionObserver. File A installs a CAPTURING mock so the draw stays
// latent (visible=false → data-anim="out") and the test replays an intersect entry by hand.
// The component's `typeof IntersectionObserver === "undefined"` guard does NOT fire here
// because the mock makes it defined — that's the point.
let ioCallback = null;
let ioObserved = [];
class MockIntersectionObserver {
  constructor(cb) { ioCallback = cb; }
  observe(target) { ioObserved.push(target); }
  unobserve() {}
  disconnect() {} // multi-call safe: fired inside the intersect callback AND on unmount
}
const originalIO = globalThis.IntersectionObserver; // undefined in jsdom
beforeEach(() => { ioCallback = null; ioObserved = []; globalThis.IntersectionObserver = MockIntersectionObserver; });
afterEach(() => { globalThis.IntersectionObserver = originalIO; });

async function nodesMounted(container) {
  await waitFor(() => { expect(container.querySelectorAll("svg g.ld-node").length).toBeGreaterThan(0); });
  return container.querySelectorAll("svg g.ld-node");
}

describe("LandingDAG — presentation-mode render (§5.1, §9)", () => {
  it("renders 29 nodes + 39 edges from FALLBACK_GRAPH after async dagre layout", async () => {
    const { container } = render(<LandingDAG />);
    await nodesMounted(container);
    expect(container.querySelectorAll("svg g.ld-node").length).toBe(29);
    expect(container.querySelectorAll("svg path.ld-edge").length).toBe(39);
  });

  it("marks the SVG aria-hidden (§9 decorative) and shows a text caption carrying the meaning", async () => {
    const { container, getByTestId } = render(<LandingDAG />);
    await nodesMounted(container);
    expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
    const caption = getByTestId("dag-caption");
    expect(caption.textContent).toContain("prerequisite");
    expect(caption.textContent).toContain("implementation");
  });

  it("flags the root node (implementation, depth 0) with ld-root + --d=0", async () => {
    const { container } = render(<LandingDAG />);
    await nodesMounted(container);
    const root = container.querySelector("svg g.ld-node.ld-root");
    expect(root).toBeTruthy();
    expect(root.querySelector("text").textContent).toBe("implementation");
    expect(root.style.getPropertyValue("--d")).toBe("0");
  });
});

describe("LandingDAG — draw-on-scroll (§3 lock 4 motion A)", () => {
  it("starts data-anim=out, flips to in on intersect — and observe() actually ran on the frame", async () => {
    const { container, getByTestId } = render(<LandingDAG />);
    await waitFor(() => expect(container.querySelectorAll("svg g.ld-node").length).toBe(29));

    const frame = getByTestId("dag-frame");
    // Guards the false-positive where an early-return-null made frameRef.current null at
    // mount so observe() was skipped — the real draw would never fire, but a bare callback
    // fire would still falsely pass. These two assertions make the draw test truthful.
    expect(ioObserved.length).toBe(1);
    expect(ioObserved[0]).toBe(frame);
    expect(frame.getAttribute("data-anim")).toBe("out");

    act(() => { ioCallback([{ isIntersecting: true, target: frame }]); });

    // setVisible(true) is a synchronous state setter flushed inside act → next line is sync.
    expect(frame.getAttribute("data-anim")).toBe("in");
  });
});