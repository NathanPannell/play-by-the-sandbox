import { expect, test } from '@playwright/test';
import { byBoil, measure } from '../tools/flicker.mjs';

/** @param {import('@playwright/test').Page} page */
const frames = (page) =>
  page.locator('#heroScene canvas.hero-canvas').evaluate((c) => Number(/** @type {HTMLElement} */ (c).dataset.frames));

test('the hero fills the screen, with the name, date, place and sign-up button as inlays', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('section.hero');
  const size = page.viewportSize();
  const box = await hero.boundingBox();
  expect(box?.y).toBe(0);
  expect(Math.round(box?.height ?? 0)).toBe(size?.height);
  const title = page.locator('.hud-title');
  await expect(title.locator('h1')).toContainText('Sandbox');
  await expect(title).toContainText('January 2027 · Vancouver Art Gallery');
  const cta = page.locator('.hud-bottom').getByRole('link', { name: /I wanna play/ });
  await expect(cta).toHaveAttribute('href', '#toys');
  await expect(cta).toBeInViewport();
  await expect(page.locator('.hud-nav').getByRole('link', { name: /Apply/ })).toBeVisible();
  await expect(page.locator('#heroScene')).toHaveAttribute('role', 'img');
  // Every inlay control is a comfortable tap target.
  const small = await page
    .locator('.hero a:visible, .hero button:visible')
    .evaluateAll((els) =>
      els.filter((el) => el.getBoundingClientRect().height < 44).map((el) => el.textContent?.trim()),
    );
  expect(small).toEqual([]);
});

test('the canvas mounts and keeps drawing the crayon scene', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('#heroScene');
  await expect(scene).toHaveAttribute('data-state', 'running');
  await expect(scene).toHaveClass(/ready/);
  const canvas = scene.locator('canvas.hero-canvas');
  await expect(canvas).toBeVisible();

  const first = await frames(page);
  await expect.poll(() => frames(page), { timeout: 15000 }).toBeGreaterThan(first + 2);

  // A drawn crayon frame is full of grain and strokes, so its PNG is big; a
  // blank or flat canvas compresses to a few kilobytes.
  const png = await canvas.screenshot();
  expect(png.length).toBeGreaterThan(100_000);
});

test('the scene stops drawing when scrolled away or when the tab is hidden', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('#heroScene');
  await expect(scene).toHaveAttribute('data-state', 'running');

  await page.locator('#wishlist').scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-state', 'paused');
  const paused = await frames(page);
  await page.waitForTimeout(700);
  expect(await frames(page)).toBe(paused);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(scene).toHaveAttribute('data-state', 'running');
  await expect.poll(() => frames(page), { timeout: 15000 }).toBeGreaterThan(paused);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(scene).toHaveAttribute('data-state', 'paused');
});

test('a lost GPU context shows the poster, then the scene comes back', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('#heroScene');
  await expect(scene).toHaveAttribute('data-state', 'running');

  await page.evaluate(() => {
    const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector('#heroScene canvas'));
    const ext = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    /** @type {any} */ (window).loseContext = ext;
    ext?.loseContext();
  });
  await expect(scene).toHaveAttribute('data-state', 'fallback');
  await expect(scene).not.toHaveClass(/ready/);
  // Scrolling or tab switches while the context is gone don't restart the loop.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(scene).toHaveAttribute('data-state', 'fallback');

  await page.evaluate(() => /** @type {any} */ (window).loseContext.restoreContext());
  await expect(scene).toHaveAttribute('data-state', 'running');
  await expect(scene).toHaveClass(/ready/);
  const restored = await frames(page);
  await expect.poll(() => frames(page), { timeout: 15000 }).toBeGreaterThan(restored + 2);
});

test('reduced motion gets one still crayon frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const scene = page.locator('#heroScene');
  await expect(scene).toHaveAttribute('data-state', 'static');
  await expect(scene).toHaveClass(/ready/);
  // The still is redrawn when the fonts and the projector's slides arrive, then never again.
  await expect
    .poll(
      async () => {
        const before = await frames(page);
        await page.waitForTimeout(1000);
        return (await frames(page)) === before;
      },
      { timeout: 20000 },
    )
    .toBe(true);
  const still = await frames(page);
  expect(still).toBeGreaterThan(0);
  expect(still).toBeLessThanOrEqual(6);
  await page.waitForTimeout(1200);
  expect(await frames(page)).toBe(still);
  expect((await scene.locator('canvas').screenshot()).length).toBeGreaterThan(100_000);
});

test('without WebGL the crayon poster stands in for the scene', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    /** @this {HTMLCanvasElement} @param {string} type @param {any[]} args */
    function noWebGL(type, ...args) {
      return /webgl/i.test(type) ? null : getContext.call(this, type, ...args);
    }
    HTMLCanvasElement.prototype.getContext = /** @type {any} */ (noWebGL);
  });
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  const scene = page.locator('#heroScene');
  await expect(scene).toHaveAttribute('data-state', 'fallback');
  await expect(scene.locator('canvas')).toHaveCount(0);
  // Nothing to pause without a scene.
  await expect(page.locator('#heroPause')).toBeHidden();
  const poster = scene.locator('img.hero-poster');
  await expect(poster).toBeVisible();
  await expect
    .poll(() => poster.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth))
    .toBeGreaterThan(300);
  await expect(page.locator('.hud-title h1')).toBeVisible();
  expect(errors).toEqual([]);
});

test('graphics QA: holding the camera still, the crayon scene does not flicker', async ({ page }) => {
  // The scene plays (crowd, flashes, marquee, confetti) while the camera stays
  // put, so any frame-to-frame popping is flicker, not motion. The one change
  // allowed is the boil: the drawing steps to its next variant a few times a
  // second (src/hero/crayon.js). Frames inside one step ("steady") must hold
  // as still as ever, so anything per-frame or high-frequency still fails here.
  // tools/flicker.mjs measures the same thing across a whole revolution.
  test.setTimeout(90_000);
  await page.goto('/?hero-debug');
  await expect(page.locator('#heroScene')).toHaveClass(/ready/);
  await page.evaluate(() => document.fonts.ready);
  for (const start of [11.2, 30]) {
    const times = Array.from({ length: 14 }, (_, i) => start + i / 30);
    const { steady, boil } = byBoil(times, await measure(page, times, true));
    expect(Math.max(...steady.flicker), `flicker from t=${start}`).toBeLessThan(3);
    expect(Math.max(...steady.pops), `popping pixels from t=${start}`).toBeLessThan(2.5);
    // The boil is a deliberate, low-rate step: most frames are steady, and a
    // step changes the drawing visibly but by no more than a redraw.
    expect(steady.flicker.length, `steady frames from t=${start}`).toBeGreaterThan(boil.flicker.length);
    expect(boil.flicker.length, `boil steps from t=${start}`).toBeGreaterThan(0);
    const mean = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(boil.mad), `the boil shows from t=${start}`).toBeGreaterThan(3 * mean(steady.mad));
    expect(Math.max(...boil.flicker), `boil size from t=${start}`).toBeLessThan(16);
    expect(Math.max(...boil.pops), `boil popping from t=${start}`).toBeLessThan(10);
  }
});

test('graphics QA: the crayon strokes travel with the surfaces as the camera turns', async ({ page }) => {
  // Draws one moment twice, the camera turned a little between. Fine marks
  // that are fixed to the screen line up best with no shift; marks drawn on
  // the surfaces line up best at the scene's own shift.
  test.setTimeout(60_000);
  await page.goto('/?hero-debug');
  await expect(page.locator('#heroScene')).toHaveClass(/ready/);
  const r = await page.evaluate(() => {
    const hero = /** @type {any} */ (window).__hero;
    /** @param {number} cam */
    const grab = (cam) => {
      const gl = /** @type {HTMLCanvasElement} */ (hero.draw(14, cam));
      const c = document.createElement('canvas');
      const W = gl.width >> 1,
        H = gl.height >> 2;
      c.width = W;
      c.height = H;
      const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
      ctx.drawImage(gl, gl.width >> 2, (gl.height * 3) >> 3, W, H, 0, 0, W, H);
      const d = ctx.getImageData(0, 0, W, H).data;
      const L = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) L[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
      // High-pass (luminance minus a 5x5 box blur): only the fine marks remain.
      const hp = new Float32Array(W * H);
      for (let y = 2; y < H - 2; y++)
        for (let x = 2; x < W - 2; x++) {
          let s = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += L[(y + dy) * W + x + dx];
          hp[y * W + x] = L[y * W + x] - s / 25;
        }
      return { hp, W, H };
    };
    const a = grab(14);
    const b = grab(14.25);
    /** @param {number} shift */
    const err = (shift) => {
      let e = 0;
      let n = 0;
      for (let y = 4; y < a.H - 4; y++)
        for (let x = 48; x < a.W - 48; x++) {
          e += Math.abs(b.hp[y * a.W + x] - a.hp[y * a.W + x - shift]);
          n++;
        }
      return e / n;
    };
    let shift = 0;
    let best = Infinity;
    for (let s = -40; s <= 40; s++) {
      const e = err(s);
      if (e < best) [shift, best] = [s, e];
    }
    return { shift, best, still: err(0) };
  });
  expect(Math.abs(r.shift), 'the marks move with the scene').toBeGreaterThan(2);
  expect(r.best, 'and line up there better than where they started').toBeLessThan(r.still * 0.92);
});

test('the camera turns all the way round, from the middle of the event', async ({ page }) => {
  await page.goto('/?hero-debug');
  await expect(page.locator('#heroScene')).toHaveClass(/ready/);
  // Four quarter turns apart, four different views; a full turn later, the first again.
  const views = await page.evaluate(() => {
    const hero = /** @type {any} */ (window).__hero;
    const scratch = document.createElement('canvas');
    const ctx = /** @type {CanvasRenderingContext2D} */ (scratch.getContext('2d', { willReadFrequently: true }));
    /** @param {number} t */
    const grab = (t) => {
      // The scene is held at one moment; only the camera moves.
      const gl = hero.draw(11.2, t);
      scratch.width = 64;
      scratch.height = 36;
      ctx.drawImage(gl, 0, 0, 64, 36);
      return Array.from(ctx.getImageData(0, 0, 64, 36).data);
    };
    return [0, 1, 2, 3, 4].map((q) => grab(11.2 + q * 18.75));
  });
  /** @param {number[]} a @param {number[]} b */
  const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  for (let q = 1; q < 4; q++) expect(diff(views[0], views[q]), `quarter turn ${q}`).toBeGreaterThan(20);
  // A full turn later it is the same view (only the gentle bob differs).
  expect(diff(views[0], views[4])).toBeLessThan(3);
});

test.describe('at 375px wide', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('the hero adds no horizontal overflow and the button stays above the fold', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#heroScene')).toHaveClass(/ready/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('.hud-bottom').getByRole('link', { name: /I wanna play/ })).toBeInViewport();
    await expect(page.locator('.hud-nav').getByRole('link', { name: /Apply/ })).toBeInViewport();
  });
});
