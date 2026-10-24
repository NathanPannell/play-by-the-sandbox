import { expect, test } from '@playwright/test';

/** Where the shared wobble filter's noise has drifted to. @param {import('@playwright/test').Page} page */
const drift = (page) => page.locator('#wmDrift').evaluate((el) => `${el.getAttribute('dx')},${el.getAttribute('dy')}`);

test('the crayon wordmark is the title inlay and the footer logo', async ({ page }) => {
  await page.goto('/');
  // The hero title reads "Play by the Sandbox" to search and screen readers.
  const title = page.locator('.hud-title h1');
  await expect(title.locator('svg.wordmark')).toBeVisible();
  await expect(title).toHaveText(/Play by the\s*Sandbox/);
  await expect(title.locator('svg.wordmark .wm-s')).toHaveCount(8);

  const footer = page.locator('footer svg.wordmark');
  await expect(footer).toHaveAttribute('role', 'img');
  await expect(footer).toHaveAttribute('aria-label', 'Sandbox');
  await expect(page.locator('footer')).not.toContainText('dragon');

  // Two wordmarks, one shared filter, and no old header bar.
  await expect(page.locator('svg.wordmark')).toHaveCount(2);
  await expect(page.locator('[id="wmWobble"]')).toHaveCount(1);
  await expect(page.locator('header.nav')).toHaveCount(0);
});

test('the wordmarks draw themselves in, then wiggle and boil smoothly', async ({ page }) => {
  await page.goto('/');
  const names = await page
    .locator('.hud-title .wm-s')
    .first()
    .evaluate((el) => el.getAnimations().map((a) => /** @type {CSSAnimation} */ (a).animationName));
  expect(names).toEqual(['sbDraw']);
  await expect
    .poll(() =>
      page
        .locator('.hud-title .wm-s')
        .last()
        .evaluate((el) => getComputedStyle(el).strokeDashoffset),
    )
    .toMatch(/^0(px)?$/);
  // The outline boils by drifting the noise, and the letters wiggle.
  const first = await drift(page);
  await expect.poll(() => drift(page), { timeout: 10_000 }).not.toBe(first);
  await expect(page.locator('.hud-title .wm-s').first()).toHaveAttribute('transform', /translate\(0 -?[\d.]+\) rotate/);

  // Smoothly: no letter moves faster than 10 px a second (2.5 px in a quarter
  // second). Both samples are timed in the page, so a busy machine that stretches
  // the wait doesn't count as faster motion.
  const sample = () =>
    page.locator('.hud-title .wm-s').evaluateAll((els) => ({
      at: performance.now(),
      centres: els.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      }),
    }));
  const a = await sample();
  await page.waitForTimeout(250);
  const b = await sample();
  const moved = Math.max(...a.centres.map(([x, y], i) => Math.hypot(b.centres[i][0] - x, b.centres[i][1] - y)));
  expect(moved / ((b.at - a.at) / 1000)).toBeLessThan(10);
});

test('the footer wordmark draws in when it scrolls into view', async ({ page }) => {
  await page.goto('/');
  const stroke = page.locator('footer .wm-s').first();
  expect(await stroke.evaluate((el) => getComputedStyle(el).strokeDashoffset)).not.toMatch(/^0(px)?$/);
  await stroke.scrollIntoViewIfNeeded();
  await expect.poll(() => stroke.evaluate((el) => getComputedStyle(el).strokeDashoffset)).toMatch(/^0(px)?$/);
});

test('the boil rests while no wordmark is on screen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#wishlist').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const resting = await drift(page);
  await page.waitForTimeout(600);
  expect(await drift(page)).toBe(resting);
});

test('the wordmarks hold still, fully drawn, for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const strokes = page.locator('.wm-s');
  const animations = await strokes.evaluateAll((els) => els.flatMap((el) => el.getAnimations()).length);
  expect(animations).toBe(0);
  const offsets = await strokes.evaluateAll((els) => els.map((el) => getComputedStyle(el).strokeDashoffset));
  expect(offsets.every((o) => /^0(px)?$/.test(o))).toBe(true);
  const before = await drift(page);
  await page.waitForTimeout(600);
  expect(await drift(page)).toBe(before);
  await expect(page.locator('.hud-title .wm-s').first()).not.toHaveAttribute('transform', /./);
});

test.describe('at 375px wide', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('the title inlay fits, with no overflow', async ({ page }) => {
    await page.goto('/');
    const box = await page.locator('.hud-title').boundingBox();
    expect(box).not.toBeNull();
    const { x, width } = /** @type {{ x: number, width: number }} */ (box);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(375);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
