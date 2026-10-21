// Graphics QA: checks the crayon pass for tiling seams. It draws the pass
// alone over flat colours (?hero-debug's paper()), high-passes the result and
// measures its autocorrelation at every horizontal and vertical shift from 8
// to 128 device pixels. Random grain and strokes stay near 0.02; a texture
// that repeats (the float-hash grain did, every 67 px) scores 0.2 to 0.45.
//
//   npm run seams                  # several pixel ratios and odd sizes, real GPU if there is one
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from '../scripts/build.mjs';
import { startServer } from '../scripts/serve.mjs';

/** Light paper shows the grain most; mid and dark show the strokes. */
export const PAPERS = {
  light: [230, 220, 200],
  mid: [120, 110, 180],
  dark: [30, 40, 100],
};

/**
 * The largest autocorrelation of the high-passed crayon paper over shifts of
 * 8 to 128 device pixels along each axis, computed in the page.
 * @param {import('@playwright/test').Page} page
 * @param {number[]} rgb
 */
export function seamScore(page, rgb) {
  return page.evaluate((rgb) => {
    const gl = /** @type {HTMLCanvasElement} */ (/** @type {any} */ (window).__hero.paper(rgb));
    const n = Math.min(256, gl.width, gl.height);
    const scratch = document.createElement('canvas');
    scratch.width = n;
    scratch.height = n;
    const ctx = /** @type {CanvasRenderingContext2D} */ (scratch.getContext('2d', { willReadFrequently: true }));
    ctx.drawImage(gl, 0, 0, n, n, 0, 0, n, n);
    const px = ctx.getImageData(0, 0, n, n).data;
    const lum = new Float64Array(n * n);
    for (let i = 0; i < n * n; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    // High-pass: subtract a 9x9 box blur.
    const hp = new Float64Array(n * n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if (yy >= 0 && yy < n && xx >= 0 && xx < n) {
              sum += lum[yy * n + xx];
              count++;
            }
          }
        }
        hp[y * n + x] = lum[y * n + x] - sum / count;
      }
    }
    let energy = 0;
    for (const v of hp) energy += v * v;
    let worst = 0;
    let at = 0;
    for (let lag = 8; lag <= Math.min(128, n - 64); lag++) {
      for (const [sx, sy] of [
        [lag, 0],
        [0, lag],
      ]) {
        let c = 0;
        let e1 = 0;
        let e2 = 0;
        for (let y = 0; y < n - sy; y++) {
          for (let x = 0; x < n - sx; x++) {
            const a = hp[y * n + x];
            const b = hp[(y + sy) * n + x + sx];
            c += a * b;
            e1 += a * a;
            e2 += b * b;
          }
        }
        const r = c / Math.sqrt(e1 * e2 + 1e-9);
        if (r > worst) {
          worst = r;
          at = sx || sy;
        }
      }
    }
    return { score: worst, lag: at, energy: energy / (n * n) };
  }, rgb);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = 4384;
  build();
  const server = /** @type {import('node:http').Server} */ (await startServer(PORT));
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    for (const [dpr, width, height] of [
      [1, 1280, 800],
      [1.25, 1366, 768],
      [1.5, 1517, 853],
      [1.75, 777, 555],
      [2, 1001, 667],
      [2.625, 412, 915],
      [3, 393, 851],
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${PORT}/?hero-debug`);
      await page.locator('#heroScene.ready').waitFor();
      const row = [];
      for (const [name, rgb] of Object.entries(PAPERS)) {
        const { score, lag } = await seamScore(page, rgb);
        row.push(`${name} ${score.toFixed(3)} @${lag}px`);
      }
      console.log(`dpr ${String(dpr).padEnd(5)} ${`${width}x${height}`.padEnd(10)} ${row.join('   ')}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}
