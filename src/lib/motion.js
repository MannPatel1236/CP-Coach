export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 1) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.6, ease: [0.2, 0, 0.2, 1] },
  }),
};

export const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

// Shared panel reveal transition: 0.5s on the [0.16, 1, 0.3, 1] ease-out curve.
// Used by Recommendations, WhyThisRec, SkillFrontier, and LandingPage (the same
// literal was duplicated before — one const so they stay in lockstep on timing).
export const panelTransition = { duration: 0.5, ease: [0.16, 1, 0.3, 1] };
