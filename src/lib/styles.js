// Reusable style fragments — avoid repeating inline objects across components.
// These are intentionally thin; prefer CSS classes when static.

export const flex = (opts = {}) => ({
  display: "flex",
  alignItems: opts.align ?? "center",
  justifyContent: opts.justify,
  flexDirection: opts.dir,
  flexWrap: opts.wrap,
  gap: opts.gap,
  ...opts,
});

export const gradientText = {
  background: "linear-gradient(135deg, #ffffff 0%, var(--primary-bright) 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

export const cardSurface = {
  background: "linear-gradient(145deg, var(--surface-1) 60%, rgba(10, 13, 20, 0.9))",
  border: "1px solid var(--outline)",
  borderRadius: "var(--radius-lg)",
};

export const surface1 = {
  background: "var(--surface-1)",
  border: "1px solid var(--outline)",
  borderRadius: "var(--radius-lg)",
};
