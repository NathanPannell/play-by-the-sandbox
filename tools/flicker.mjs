// Graphics QA for the hero: draws exact moments through the ?hero-debug hook,
// in short 30 fps runs spread across one camera revolution, and measures how
// much each frame changes in the browser (no screenshots, no decoding).
//
//   npm run flicker                      # desktop and mobile
//   npm run flicker -- --save <dir>      # also save each run's middle frame
//   npm run flicker -- --tier full       # force a quality tier (full, lite, software)
//   npm run flicker -- --gpu             # the real GPU instead of SwiftShader
//
// Each device is measured twice: with the camera turning as it does on the
// page ("turning"), and with the camera held at the start of each run while
// the scene plays ("held"), which isolates flicker from intended motion.
//
// mad:     mean absolute difference between consecutive frames (0-255). It
//          includes the intended motion.
// flicker: mean |F[t] - (F[t-1] + F[t+1]) / 2| per pixel. Smooth motion mostly
//          cancels; pops, strobing and shimmer don't.
// pops:    share of pixels whose second difference exceeds 48.
//
// The crayon drawing "boils" on purpose: it steps to a slightly different
// drawing BOIL_FPS times a second (src/hero/crayon.js). So the frames are told
// apart: "steady" ones, all three inside one boil step, must not flicker at
// all; "boil" ones straddle a step and may change by the boil's own amount.
// Anything per-frame or high-frequency shows up in the steady frames.
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from '../scripts/build.mjs';
import { startServer } from '../scripts/serve.mjs';
import { boilStep } from '../src/hero/crayon.js';

const PORT = 4393;
export const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/**
 * Draws each time in `times` and returns the per-pair metrics, computed in the page.
 * @param {import('@playwright/test').Page} page
 * @param {number[]} times
 * @param {boolean} [held] hold the camera at the first time
 */
export function measure(page, times, held = false) {
  return page.evaluate(([times, held]) => {
    const hero = /** @type {any} */ (window).__hero;
    const scratch = document.createElement('canvas');
    const ctx = /** @type {CanvasRenderingContext2D} */ (scratch.getContext('2d', { willReadFrequently: true }));
    /** @type {Uint8ClampedArray[]} */
    const frames = [];
    for (const t of times) {
      const gl = /** @type {HTMLCanvasElement} */ (hero.draw(t, held ? times[0] : t));
      scratch.width = gl.width;
      scratch.height = gl.height;
      ctx.drawImage(gl, 0, 0);
      frames.push(ctx.getImageData(0, 0, gl.width, gl.height).data);
    }
    const mad = [];
    const flicker = [];
    const pops = [];
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1];
      const b = frames[i];
      let sum = 0;
      for (let k = 0; k < a.length; k++) if ((k & 3) !== 3) sum += Math.abs(b[k] - a[k]);
      mad.push(sum / ((a.length / 4) * 3));
    }
    for (let i = 1; i < frames.length - 1; i++) {
      const a = frames[i - 1];
      const b = frames[i];
      const c = frames[i + 1];
      let sum = 0;
      let popped = 0;
      for (let k = 0; k < a.length; k += 4) {
        let m = 0;
        for (let ch = 0; ch < 3; ch++) m = Math.max(m, Math.abs(b[k + ch] - (a[k + ch] + c[k + ch]) / 2));
        sum += m;
        if (m > 48) popped++;
      }
      flicker.push(sum / (a.length / 4));
      pops.push((popped / (a.length / 4)) * 100);
    }
    return { mad, flicker, pops };
  }, /** @type {[number[], boolean]} */ ([times, held]));
}

/**
 * Splits measure()'s per-frame metrics into steady frames (all inside one boil
 * step) and boil frames (across a step).
 * @param {number[]} times the times passed to measure()
 * @param {{ mad: number[], flicker: number[], pops: number[] }} m
 */
export function byBoil(times, m) {
  const steps = times.map(boilStep);
  const steady = {
    mad: /** @type {number[]} */ ([]),
    flicker: /** @type {number[]} */ ([]),
    pops: /** @type {number[]} */ ([]),
  };
  const boil = {
    mad: /** @type {number[]} */ ([]),
    flicker: /** @type {number[]} */ ([]),
    pops: /** @type {number[]} */ ([]),
  };
  m.mad.forEach((v, i) => (steps[i] === steps[i + 1] ? steady : boil).mad.push(v));
  m.flicker.forEach((v, i) => {
    const group = steps[i] === steps[i + 1] && steps[i + 1] === steps[i + 2] ? steady : boil;
    group.flicker.push(v);
    group.pops.push(m.pops[i]);
  });
  return { steady, boil };
}

/** @param {number[]} xs */
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
/** @param {number[]} xs */
const max = (xs) => (xs.length ? Math.max(...xs) : 0);

/**
 * Runs of `frames` frames at 30 fps, `runs` of them spread over `period` seconds.
 * @param {{ start?: number, period?: number, runs?: number, frames?: number }} [options]
 */
export function schedule({ start = 0, period = 75, runs = 8, frames = 12 } = {}) {
  return Array.from({ length: runs }, (_, r) =>
    Array.from({ length: frames }, (_, f) => start + (r * period) / runs + f / 30),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const saveAt = process.argv.indexOf('--save');
  const saveDir = saveAt > 0 ? process.argv[saveAt + 1] : null;
  // --tier full|lite|software forces a quality tier; --gpu uses the real GPU
  // (headless Chromium otherwise renders WebGL with SwiftShader on the CPU).
  const tierAt = process.argv.indexOf('--tier');
  const tier = tierAt > 0 ? `&hero-tier=${process.argv[tierAt + 1]}` : '';
  const gpu = process.argv.includes('--gpu') ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : [];
  build();
  const server = /** @type {import('node:http').Server} */ (await startServer(PORT));
  const browser = await chromium.launch({ args: gpu });
  try {
    for (const [name, device] of Object.entries(DEVICES)) {
      const context = await browser.newContext(device);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?hero-debug${tier}`);
      await page.locator('#heroScene.ready').waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      for (const held of [false, true]) {
        const empty = () => ({
          mad: /** @type {number[]} */ ([]),
          flicker: /** @type {number[]} */ ([]),
          pops: /** @type {number[]} */ ([]),
        });
        const all = { steady: empty(), boil: empty() };
        for (const [i, times] of schedule().entries()) {
          const parts = byBoil(times, await measure(page, times, held));
          for (const k of /** @type {const} */ (['steady', 'boil'])) {
            all[k].mad.push(...parts[k].mad);
            all[k].flicker.push(...parts[k].flicker);
            all[k].pops.push(...parts[k].pops);
          }
          if (saveDir && !held) {
            await page.evaluate((t) => /** @type {any} */ (window).__hero.draw(t), times[times.length >> 1]);
            await page.locator('#heroScene canvas').screenshot({ path: `${saveDir}/${name}-${i}.png` });
          }
        }
        for (const k of /** @type {const} */ (['steady', 'boil'])) {
          const a = all[k];
          console.log(
            `${name.padEnd(8)} ${held ? 'held   ' : 'turning'} ${k.padEnd(6)} mad ${mean(a.mad).toFixed(2)} (max ${max(a.mad).toFixed(2)})  ` +
              `flicker ${mean(a.flicker).toFixed(2)} (max ${max(a.flicker).toFixed(2)})  ` +
              `pops ${mean(a.pops).toFixed(2)}% (max ${max(a.pops).toFixed(2)}%)`,
          );
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}
