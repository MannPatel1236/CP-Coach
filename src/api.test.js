import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CF_TAG_MAP,
  CANONICAL_TO_CF_TAG,
  normalizeCfTag,
  canonicalToCfTag,
  fetchProblemsByTag,
} from "./api.js";

// Parity with backend/platforms/normalizer.py CF_TAG_MAP. If the frontend map
// drifts from the backend map, the client-only fallback path (Path B) and the
// backend path (Path A) will speak different tag namespaces and recommendations
// silently mismatch. These pins catch that drift.

describe("CF_TAG_MAP parity with backend normalizer.py", () => {
  it("maps the many-to-one / special CF tags to canonical names", () => {
    // Identity-ish (underscored) mappings
    expect(normalizeCfTag("dfs and similar")).toBe("dfs_and_similar");
    expect(normalizeCfTag("constructive algorithms")).toBe("constructive_algorithms");
    expect(normalizeCfTag("binary search")).toBe("binary_search");
    expect(normalizeCfTag("two pointers")).toBe("two_pointers");
    expect(normalizeCfTag("number theory")).toBe("number_theory");
    expect(normalizeCfTag("data structures")).toBe("data_structures");
    expect(normalizeCfTag("divide and conquer")).toBe("divide_and_conquer");
    expect(normalizeCfTag("brute force")).toBe("brute_force");
    expect(normalizeCfTag("shortest paths")).toBe("shortest_paths");
    expect(normalizeCfTag("graph matchings")).toBe("flows");
    expect(normalizeCfTag("string suffix structures")).toBe("string_algorithms");
    expect(normalizeCfTag("dsu")).toBe("dsu");
    expect(normalizeCfTag("matrices")).toBe("matrices");
  });

  it("collapses many CF tags onto the same canonical (many-to-one)", () => {
    // "dynamic programming" AND "games" both → "dp"
    expect(normalizeCfTag("dynamic programming")).toBe("dp");
    expect(normalizeCfTag("games")).toBe("dp");
    // "probabilities" AND "fft" both → "math"
    expect(normalizeCfTag("probabilities")).toBe("math");
    expect(normalizeCfTag("fft")).toBe("math");
    // "ternary search" → "binary_search"
    expect(normalizeCfTag("ternary search")).toBe("binary_search");
    // "meet in the middle" → "divide_and_conquer"
    expect(normalizeCfTag("meet in the middle")).toBe("divide_and_conquer");
    // "2-sat" → "graphs"
    expect(normalizeCfTag("2-sat")).toBe("graphs");
    // "chinese remainder theorem" → "number_theory"
    expect(normalizeCfTag("chinese remainder theorem")).toBe("number_theory");
    // "expression parsing" → "string_algorithms"
    expect(normalizeCfTag("expression parsing")).toBe("string_algorithms");
  });

  it("falls back to lower-case + spaces→underscores for unmapped CF tags", () => {
    // Mirrors backend: self.CF_TAG_MAP.get(tag, tag.lower().replace(" ", "_"))
    expect(normalizeCfTag("math")).toBe("math");
    expect(normalizeCfTag("greedy")).toBe("greedy");
    expect(normalizeCfTag("geometry")).toBe("geometry");
    expect(normalizeCfTag("bitmasks")).toBe("bitmasks");
    expect(normalizeCfTag("hashing")).toBe("hashing");
    expect(normalizeCfTag("combinatorics")).toBe("combinatorics");
  });
});

describe("CANONICAL_TO_CF_TAG inverse (CF problemset API query tags)", () => {
  it("resolves 'dp' to 'dynamic programming', NOT 'games'", () => {
    // Critical: CF's problemset.problems API indexes "dynamic programming".
    // A naive auto-inverse of the many-to-one CF_TAG_MAP could yield "games",
    // which the CF API does not index → empty recommendations.
    expect(canonicalToCfTag("dp")).toBe("dynamic programming");
    expect(canonicalToCfTag("dp")).not.toBe("games");
  });

  it("resolves the other many-to-one canonicals to their mainstream CF tag", () => {
    expect(canonicalToCfTag("flows")).toBe("graph matchings");
    expect(canonicalToCfTag("string_algorithms")).toBe("string suffix structures");
    expect(canonicalToCfTag("binary_search")).toBe("binary search");
    expect(canonicalToCfTag("divide_and_conquer")).toBe("divide and conquer");
    expect(canonicalToCfTag("number_theory")).toBe("number theory");
    expect(canonicalToCfTag("math")).toBe("math");
    expect(canonicalToCfTag("graphs")).toBe("graphs");
  });

  it("resolves the underscored-identity canonicals via the _ → space fallback", () => {
    // Not in CANONICAL_TO_CF_TAG explicitly; fallback still yields a valid CF tag.
    expect(canonicalToCfTag("dfs_and_similar")).toBe("dfs and similar");
    expect(canonicalToCfTag("constructive_algorithms")).toBe("constructive algorithms");
    expect(canonicalToCfTag("two_pointers")).toBe("two pointers");
    expect(canonicalToCfTag("data_structures")).toBe("data structures");
    expect(canonicalToCfTag("brute_force")).toBe("brute force");
    expect(canonicalToCfTag("shortest_paths")).toBe("shortest paths");
  });

  it("round-trips: every CF-data canonical forwards back to itself", () => {
    // For each canonical name we expose, the CF tag we pick must normalize back
    // to that same canonical. Catches typos and wrong inverse picks for the
    // underscored-identity cases that the explicit asserts above don't cover.
    for (const [canonical, cfTag] of Object.entries(CANONICAL_TO_CF_TAG)) {
      expect(normalizeCfTag(cfTag), `${cfTag} should normalize back to ${canonical}`).toBe(canonical);
    }
  });

  it("every canonical reachable from a CF tag has a reverse CF query tag", () => {
    // Parity invariant: if normalizeCfTag can produce a canonical from some CF
    // tag, CANONICAL_TO_CF_TAG must be able to send it back to a CF API tag.
    // Guards against a forward map gaining a canonical the inverse doesn't know.
    for (const canonical of Object.values(CF_TAG_MAP)) {
      expect(CANONICAL_TO_CF_TAG[canonical], `no inverse for ${canonical}`).toBeDefined();
    }
  });
});

describe("fetchProblemsByTag translates canonical → CF API query", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "OK", result: { problems: [], problemStatistics: [] } }),
    }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("queries 'dynamic programming' (not 'dp') for the dp canonical tag", async () => {
    await fetchProblemsByTag("dp", undefined);
    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("tags=dynamic%20programming");
  });

  it("queries 'graph matchings' for the flows canonical tag", async () => {
    await fetchProblemsByTag("flows", undefined);
    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("tags=graph%20matchings");
  });

  it("passes raw CF tags through unchanged", async () => {
    // A raw CF tag (already space-separated) is not in CANONICAL_TO_CF_TAG and
    // has no underscores, so the _ → space fallback is a no-op. This keeps
    // legacy callers that pass raw CF tags working.
    await fetchProblemsByTag("dynamic programming", undefined);
    const calledUrl = globalThis.fetch.mock.calls[0][0];
    expect(calledUrl).toContain("tags=dynamic%20programming");
  });
});
