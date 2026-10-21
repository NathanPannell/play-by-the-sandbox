// How much scene a device gets. Phones get a smaller crowd, fewer particles and
// 30 fps; everyone gets a device pixel ratio capped at 1.5.

export const MAX_DPR = 1.5;

/**
 * @typedef {{
 *   mobile: boolean,
 *   dpr: number,
 *   crowd: number,
 *   confetti: number,
 *   searchlights: number,
 *   frameSkip: number,
 * }} Quality
 */

/**
 * @param {{ width: number, devicePixelRatio: number, coarsePointer?: boolean }} env
 * @returns {Quality}
 */
export function pickQuality({ width, devicePixelRatio, coarsePointer = false }) {
  const mobile = width < 760 || (coarsePointer && width < 1100);
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), MAX_DPR);
  return mobile
    ? { mobile, dpr, crowd: 90, confetti: 110, searchlights: 2, frameSkip: 1 }
    : { mobile, dpr, crowd: 230, confetti: 320, searchlights: 4, frameSkip: 0 };
}

/** A small deterministic PRNG (mulberry32), so every visitor sees the same scene. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash of an integer to [0, 1), for per-frame choices that must not depend on frame rate.
 * @param {number} n
 */
export function hash1(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
