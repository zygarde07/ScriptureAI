// Small helpers shared by all GSAP animations.

// True when the visitor asked their system for reduced motion.
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Use this for every animation duration: it becomes 0 (instant) when the
// visitor wants reduced motion, so the same code serves both groups.
export const dur = (seconds) => (prefersReducedMotion() ? 0 : seconds);
