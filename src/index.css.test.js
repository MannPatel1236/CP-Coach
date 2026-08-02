/* global process */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Read the stylesheet as a raw source string so we assert on design-token
// SOURCE directly. (The plan specified `import css from "./index.css?raw"`, but
// vitest 1.6 stubs `.css` imports — including the `?raw` query — to `""` when
// `test.css` is unset; and `new URL("./index.css", import.meta.url)` resolves
// to a `localhost` scheme under vite-node's module transform, which node:fs
// rejects. Resolving off `process.cwd()` (the repo root, guaranteed by the
// shell) reads the file verbatim — the same documented intent: assert on raw
// source, not getComputedStyle.)
//
// Why a source-string test (not getComputedStyle): jsdom does not process
// :root custom properties from an imported CSS file, and does not load
// @fontsource @font-face rules — so computed-style assertions would silently
// pass against the wrong CSS. Asserting on the source is the only honest guard
// for "every existing token name still resolves", which is the Greenhouse
// surgical contract (spec §3 lock 6).
const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");
// `index.html?raw` works in vitest (HTML is not a stubbed asset type like CSS).
import html from "../index.html?raw";

// Token names that EXISTING components read. If any disappear, the app breaks
// even though the build stays green — this is the regression net for the
// restyle and must stay green forever across all Greenhouse phases.
const KEPT_TOKEN_NAMES = [
  "--surface-base", "--surface-1", "--surface-2", "--surface-3",
  "--surface-4", "--surface-5", "--surface-dim",
  "--primary", "--primary-container", "--primary-dim", "--primary-bright",
  "--on-primary", "--primary-glow", "--primary-glow-strong",
  "--on-surface", "--on-surface-variant", "--text-muted", "--text-dim",
  "--outline", "--outline-variant",
  "--error", "--error-container", "--success", "--success-container",
  "--warning", "--warning-container",
  "--font-heading", "--font-body", "--font-mono",
  "--space-xs", "--space-sm", "--space-md", "--space-lg",
  "--space-xl", "--space-2xl", "--space-3xl", "--space-4xl",
  "--radius-xs", "--radius-sm", "--radius-md", "--radius-lg",
  "--radius-xl", "--radius-full",
  "--z-base", "--z-dropdown", "--z-sticky", "--z-fixed",
  "--z-modal-backdrop", "--z-modal", "--z-tooltip",
];

describe("Greenhouse Phase 1 — fonts + kept-name contract", () => {
  it("keeps every existing token name resolving (no rename)", () => {
    // `--name:` (with colon) weeds out substrings inside other tokens/values.
    const missing = KEPT_TOKEN_NAMES.filter((n) => !css.includes(`${n}:`));
    expect(missing).toEqual([]);
  });

  it("declares --font-display and aliases --font-heading to it", () => {
    expect(css).toContain("--font-display:");
    expect(css).toContain("--font-heading: var(--font-display)");
  });

  it("uses Inter for body and JetBrains Mono for code", () => {
    expect(css).toMatch(/--font-body:.*Inter/);
    expect(css).toMatch(/--font-mono:.*JetBrains Mono/);
  });

  it("loads fonts via bundled @fontsource, not a Google CDN", () => {
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("fonts.gstatic.com");
  });
});
