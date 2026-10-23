// Graphics QA: how heavy the hero is. Loads the page normally (no debug
// hook), counts WebGL draw calls and triangles per rendered frame by
// wrapping the context's draw functions, and records frame intervals and the
// hero's own frame rate over a few seconds. Uses the real GPU when there is
// one, and throttles the CPU 4x with the DevTools protocol.
//
//   npm run perf                       # mobile and desktop, CPU throttled 4x
//   npm run perf -- --url <origin>     # against another server (e.g. a staging build)
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';
import { build } from '../scripts/build.mjs';
import { startServer } from '../scripts/serve.mjs';

export const PROFILES = {
  'mobile (Pixel 7, 4x CPU)': { device: devices['Pixel 7'], throttle: 4 },
  'desktop (1440x900, 4x CPU)': {
    device: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    throttle: 4,
  },
};

/** Counts draw calls and triangles on every WebGL2 context in the page. */
function instrument() {
  const stats = { calls: 0, triangles: 0 };
  /** @type {any} */ (window).__glStats = stats;
  const proto = WebGL2RenderingContext.prototype;
  const TRIANGLES = 4;
  /** @param {string} name @param {(args: any[]) => number} tris */
  const wrap = (name, tris) => {
    const original = /** @type {any} */ (proto)[name];
    /** @type {any} */ (proto)[name] = function (/** @type {any[]} */ ...args) {
      stats.calls++;
      stats.triangles += tris(args);
      return original.apply(this, args);
    };
  };
  wrap('drawArrays', (a) => (a[0] === TRIANGLES ? a[2] / 3 : 0));
  wrap('drawElements', (a) => (a[0] === TRIANGLES ? a[1] / 3 : 0));
  wrap('drawArraysInstanced', (a) => (a[0] === TRIANGLES ? (a[2] / 3) * a[3] : 0));
  wrap('drawElementsInstanced', (a) => (a[0] === TRIANGLES ? (a[1] / 3) * a[4] : 0));
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} seconds
 */
export async function sample(page, seconds) {
  return page.evaluate(async (seconds) => {
    const stats = /** @type {any} */ (window).__glStats;
    const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('#heroScene canvas'));
    const frames = () => Number(canvas.dataset.frames);
    stats.calls = 0;
    stats.triangles = 0;
    const f0 = frames();
    /** @type {number[]} */
    const intervals = [];
    let last = performance.now();
    const start = last;
    await new Promise((done) => {
      const tick = (/** @type {number} */ now) => {
        intervals.push(now - last);
        last = now;
        if (now - start < seconds * 1000) requestAnimationFrame(tick);
        else done(null);
      };
      requestAnimationFrame(tick);
    });
    const drawn = frames() - f0;
    intervals.sort((a, b) => a - b);
    const pct = (/** @type {number} */ p) =>
      intervals[Math.min(intervals.length - 1, Math.floor(p * intervals.length))];
    return {
      fps: drawn / seconds,
      callsPerFrame: stats.calls / Math.max(1, drawn),
      trianglesPerFrame: stats.triangles / Math.max(1, drawn),
      medianInterval: pct(0.5),
      p95Interval: pct(0.95),
      canvas: `${canvas.width}x${canvas.height}`,
    };
  }, seconds);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const urlAt = process.argv.indexOf('--url');
  let origin = urlAt > 0 ? process.argv[urlAt + 1] : '';
  /** @type {import('node:http').Server | null} */
  let server = null;
  if (!origin) {
    build();
    server = /** @type {import('node:http').Server} */ (await startServer(4383));
    origin = 'http://127.0.0.1:4383';
  }
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    for (const [name, { device, throttle }] of Object.entries(PROFILES)) {
      const context = await browser.newContext(device);
      const page = await context.newPage();
      await page.addInitScript(instrument);
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await cdp.send('Performance.enable');
      const taskSeconds = async () =>
        /** @type {{ metrics: { name: string, value: number }[] }} */ (
          await cdp.send('Performance.getMetrics')
        ).metrics.find((m) => m.name === 'TaskDuration')?.value ?? 0;
      await page.goto(`${origin}/`);
      await page.locator('#heroScene.ready').waitFor({ timeout: 60000 });
      await page.waitForTimeout(3000);
      const before = await taskSeconds();
      const r = await sample(page, 6);
      const busy = (await taskSeconds()) - before;
      const cpuPerFrame = (busy * 1000) / Math.max(1, r.fps * 6);
      console.log(
        `${name.padEnd(28)} canvas ${r.canvas.padEnd(10)} hero ${r.fps.toFixed(1)} fps   ` +
          `draw calls ${r.callsPerFrame.toFixed(0)}   triangles ${Math.round(r.trianglesPerFrame).toLocaleString('en')}   ` +
          `main thread ${cpuPerFrame.toFixed(1)} ms per hero frame (${((busy / 6) * 100).toFixed(0)}% busy)   ` +
          `frame interval median ${r.medianInterval.toFixed(1)} ms, p95 ${r.p95Interval.toFixed(1)} ms`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
    server?.close();
  }
}
