import { describe, it, expect } from "vitest";
import { weekLabel } from "./weekLabel.js";

// Locked display rule (user-approved): a Mon–Sun ISO week is claimed by the
// month its Monday falls in, numbered by which Monday of that month it is.
// Expected values hand-checked against a calendar:
//   2026-W31 → Mon Jul 27 (4th Monday of July) — straddles Aug 1–2 but stays "Jul W4"
//   2026-W36 → Mon Aug 31 (5th Monday of August)
//   2026-W01 → Mon Dec 29, 2025 (5th Monday of December)
describe("weekLabel — human-readable ISO week labels", () => {
  it("marks a week by its Monday's month and which Monday of that month it is", () => {
    expect(weekLabel("2026-W31")).toBe("Jul W4");
    expect(weekLabel("2026-W32")).toBe("Aug W1");
    expect(weekLabel("2026-W36")).toBe("Aug W5");
    expect(weekLabel("2026-W37")).toBe("Sep W1");
    expect(weekLabel("2026-W40")).toBe("Sep W4");
  });

  it("labels ISO week 1 by its Monday's calendar month (may be the prior December)", () => {
    expect(weekLabel("2026-W01")).toBe("Dec W5");
  });

  it("passes non-ISO input through unchanged (weeks arrays contain nulls)", () => {
    expect(weekLabel(null)).toBeNull();
    expect(weekLabel("")).toBe("");
  });
});
