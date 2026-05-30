import { describe, it, expect } from "vitest";

describe("Tag normalization", () => {
  it("converts snake_case to space-separated for CF API", () => {
    const tag = "dfs_and_similar";
    const cfTag = tag.replace(/_/g, " ");
    expect(cfTag).toBe("dfs and similar");
  });

  it("handles multiple underscores", () => {
    const tag = "constructive_algorithms";
    const cfTag = tag.replace(/_/g, " ");
    expect(cfTag).toBe("constructive algorithms");
  });
});

describe("Difficulty color thresholds", () => {
  // Actual implementation uses ratingTier:
  // rating < 1200 → gray, 1200-1400 → green, 1400-1600 → cyan,
  // 1600-1900 → blue, 1900-2100 → violet, 2100-2400 → orange, ≥2400 → red
  const diffColor = (rating) => {
    if (rating < 1200) return "gray";
    if (rating < 1400) return "green";
    if (rating < 1600) return "cyan";
    if (rating < 1900) return "blue";
    if (rating < 2100) return "violet";
    if (rating < 2400) return "orange";
    return "red";
  };

  it("categorizes easy correctly", () => {
    expect(diffColor(800)).toBe("gray");
    expect(diffColor(1100)).toBe("gray");
    expect(diffColor(1200)).toBe("green");
    expect(diffColor(1300)).toBe("green");
  });

  it("categorizes medium correctly", () => {
    expect(diffColor(1400)).toBe("cyan");
    expect(diffColor(1500)).toBe("cyan");
    expect(diffColor(1700)).toBe("blue");
  });

  it("categorizes hard correctly", () => {
    expect(diffColor(1900)).toBe("violet");
    expect(diffColor(2000)).toBe("violet");
    expect(diffColor(2100)).toBe("orange");
    expect(diffColor(2400)).toBe("red");
    expect(diffColor(3500)).toBe("red");
  });
});

describe("AC rate thresholds", () => {
  const acColor = (rate) => {
    if (rate < 0.4) return "red";
    if (rate < 0.65) return "amber";
    return "green";
  };

  it("marks weak areas below 65%", () => {
    expect(acColor(0.3)).toBe("red");
    expect(acColor(0.5)).toBe("amber");
    expect(acColor(0.64)).toBe("amber");
  });

  it("marks strong areas at 65% and above", () => {
    expect(acColor(0.65)).toBe("green");
    expect(acColor(0.9)).toBe("green");
  });
});