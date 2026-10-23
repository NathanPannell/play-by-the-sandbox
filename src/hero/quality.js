// How much scene a device gets. Phones get a smaller crowd, fewer particles,
// 2x instead of 4x antialiasing, 30 fps and a device pixel ratio capped at
// 1.25 (1.5 elsewhere). A software WebGL renderer (no usable GPU, e.g. SwiftShader or
// llvmpipe) gets the phone-sized scene drawn at 0.6x resolution, without
// antialiasing, at about 20 fps, because every pixel costs CPU there.

export const MAX_DPR = 1.5;
export const MOBILE_DPR = 1.25;
/** Resolution scale for software renderers. */
export const SOFTWARE_SCALE = 0.6;

/**
 * @typedef {{
 *   mobile: boolean,
 *   lite: boolean,
 *   dpr: number,
 *   crowd: number,
 *   confetti: number,
 *   searchlights: number,
 *   frameSkip: number,
 *   msaa: number,
 * }} Quality
 */

/**
 * @param {{ width: number, devicePixelRatio: number, coarsePointer?: boolean, software?: boolean }} env
 * @returns {Quality}
 */
export function pickQuality({ width, devicePixelRatio, coarsePointer = false, software = false }) {
  const mobile = width < 760 || (coarsePointer && width < 1100);
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), mobile ? MOBILE_DPR : MAX_DPR);
  const lite = { crowd: 100, confetti: 110, searchlights: 3 };
  if (software) return { mobile, lite: true, ...lite, dpr: SOFTWARE_SCALE, frameSkip: 2, msaa: 0 };
  return mobile
    ? { mobile, lite: true, ...lite, dpr, frameSkip: 1, msaa: 2 }
    : { mobile, lite: false, dpr, crowd: 260, confetti: 300, searchlights: 6, frameSkip: 0, msaa: 4 };
}

/**
 * Adaptive quality: one step of the render scale, from the mean interval
 * between drawn frames over the last window. Slow frames step the scale down
 * by 15% at once; it only steps back up after three calm windows in a row, so
 * it doesn't hunt. Changing the scale re-allocates the render target, so this
 * runs every couple of seconds, not every frame.
 * @param {{ scale: number, interval: number, budget: number, calm: number, min: number }} state
 *   budget: the interval the device should manage (ms); min: the lowest scale allowed
 * @returns {{ scale: number, calm: number }}
 */
export function adaptScale({ scale, interval, budget, calm, min }) {
  if (interval > budget * 1.3) return { scale: Math.max(min, Math.round(scale * 0.85 * 100) / 100), calm: 0 };
  if (interval > budget * 1.08) return { scale, calm: 0 };
  if (calm + 1 >= 3 && scale < 1) return { scale: Math.min(1, Math.round((scale / 0.85) * 100) / 100), calm: 0 };
  return { scale, calm: calm + 1 };
}

/**
 * Whether a WebGL context is drawn by the CPU rather than a GPU.
 * @param {string} renderer the unmasked renderer string
 */
export function isSoftwareRenderer(renderer) {
  return /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(renderer);
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
