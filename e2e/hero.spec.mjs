import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
const frames = (page) =>
  page.locator('#heroScene canvas.hero-canvas').evaluate((c) => Number(/** @type {HTMLElement} */ (c).dataset.frames));

test('the hero keeps the name, date, place and sign-up button over the scene', async ({ page }) => {
  await page.goto('/');
  const card = page.locator('.hero-card');
  await expect(card.locator('h1')).toContainText('Sandbox');
  await expect(card).toContainText('January 2027');
  await expect(card).toContainText('Vancouver Art Gallery');
  const cta = card.getByRole('link', { name: /I wanna play/ });
  await expect(cta).toHaveAttribute('href', '#toys');
  await expect(cta).toBeInViewport();
  await expect(page.locator('#heroScene')).toHaveAttribute('role', 'img');
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
  const poster = scene.locator('img.hero-poster');
  await expect(poster).toBeVisible();
  await expect
    .poll(() => poster.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth))
    .toBeGreaterThan(300);
  await expect(page.locator('.hero-card h1')).toBeVisible();
  expect(errors).toEqual([]);
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
    await expect(page.locator('.hero-card').getByRole('link', { name: /I wanna play/ })).toBeInViewport();
  });
});
