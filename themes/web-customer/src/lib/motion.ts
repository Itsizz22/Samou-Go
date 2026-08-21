/**
 * Motion presets for the customer app — one vocabulary so transitions feel the
 * same everywhere. All GPU-friendly (transform + opacity only) for 60fps on
 * mid-range Android WebViews.
 */
import type { Variants } from 'framer-motion';

/** Boot: logo springs from a small, dimmed mark into full size.
 * Uses only transform + opacity for reliable GPU acceleration on Android.
 * (filter: blur() is not GPU-accelerated on many Android WebViews.)
 */
export const bootVariants: Variants = {
  initial: { opacity: 0, scale: 0.55 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 180, damping: 18 },
  },
  exit: { opacity: 0, scale: 1.06, transition: { duration: 0.35, ease: 'easeInOut' } },
};

/** Page route: slide-in from the direction of travel with a soft fade. */
export const pageVariants: Variants = {
  initial: { opacity: 0, x: 28, y: 8 },
  animate: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] },
  },
  exit: { opacity: 0, x: -24, transition: { duration: 0.18, ease: 'easeIn' } },
};

/** Staggered children — used by store cards and order rows. */
export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
};

export const fadeSlideUp: Variants = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } },
};

/** Heart toggle — a quick pop so the state change feels physical. */
export const heartTap: Variants = {
  tap: { scale: 0.78 },
};

/** Cart badge — springs into a little bounce when the count changes. */
export const badgeBounce = {
  initial: { scale: 0.4 },
  animate: { scale: [0.4, 1.15, 0.92, 1] },
  transition: { duration: 0.5, times: [0, 0.5, 0.8, 1], ease: 'easeOut' },
};

/** OTP error shake — horizontal judder, then settle. */
export const errorShake: Variants = {
  initial: { x: 0 },
  animate: {
    x: [0, -9, 9, -6, 6, -3, 3, 0],
    transition: { duration: 0.45, ease: 'easeInOut' },
  },
};

/** OTP success — a quiet, confident pulse. */
export const successPulse: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.06, 1],
    transition: { duration: 0.45, ease: 'easeOut' },
  },
};
