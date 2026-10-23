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
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from '../scripts/build.mjs';
import { startServer } from '../scripts/serve.mjs';

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

/** @param {number[]} xs */
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
/** @param {number[]} xs */
const max = (xs) => Math.max(...xs);

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
        const all = {
          mad: /** @type {number[]} */ ([]),
          flicker: /** @type {number[]} */ ([]),
          pops: /** @type {number[]} */ ([]),
        };
        for (const [i, times] of schedule().entries()) {
          const m = await measure(page, times, held);
          all.mad.push(...m.mad);
          all.flicker.push(...m.flicker);
          all.pops.push(...m.pops);
          if (saveDir && !held) {
            await page.evaluate((t) => /** @type {any} */ (window).__hero.draw(t), times[times.length >> 1]);
            await page.locator('#heroScene canvas').screenshot({ path: `${saveDir}/${name}-${i}.png` });
          }
        }
        console.log(
          `${name.padEnd(8)} ${held ? 'held   ' : 'turning'} mad ${mean(all.mad).toFixed(2)} (max ${max(all.mad).toFixed(2)})  ` +
            `flicker ${mean(all.flicker).toFixed(2)} (max ${max(all.flicker).toFixed(2)})  ` +
            `pops ${mean(all.pops).toFixed(2)}% (max ${max(all.pops).toFixed(2)}%)`,
        );
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}
