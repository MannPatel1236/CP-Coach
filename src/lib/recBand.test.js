import { describe, it, expect } from "vitest";
import { bandFor } from "./recBand.js";

describe("recBand — bandFor", () => {
  it("returns floor-to-100 lo and ceil-to-100 hi around the rating (±350)", () => {
    // Current Recommendations.jsx: lo = max(800, floor((r-100)/100)*100); hi = ceil((r+350)/100)*100
    expect(bandFor(1500)).toEqual({ lo: 1400, hi: 1900 });
    expect(bandFor(800)).toEqual({ lo: 800, hi: 1200 });
  });

  it("clamps the floor at 800 (BASE_RECOMMEND_RATING)", () => {
    expect(bandFor(700).lo).toBe(800);
    expect(bandFor(0).lo).toBe(800);
  });

  it("rounds a non-multiple-of-100 rating to the nearest band edges", () => {
    // r=1547: lo = max(800, floor(1447/100)*100)=1400; hi = ceil(1897/100)*100=1900
    expect(bandFor(1547)).toEqual({ lo: 1400, hi: 1900 });
  });
});
