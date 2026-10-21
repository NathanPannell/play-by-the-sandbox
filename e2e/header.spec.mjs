import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
const seed = (page) => page.locator('#wmNoise').getAttribute('seed');

test('the header shows the crayon wordmark, named and linking home', async ({ page }) => {
  await page.goto('/');
  const home = page.locator('header.nav a.brand');
  await expect(home).toHaveAttribute('href', '#top');
  await expect(home).toHaveAccessibleName('Play by the Sandbox home');
  const wordmark = home.locator('svg.wordmark');
  await expect(wordmark).toBeVisible();
  await expect(wordmark).toHaveAttribute('role', 'img');
  await expect(wordmark).toHaveAttribute('aria-label', 'Sandbox');
  // s, a, n, d, b, o and the two strokes of the x.
  await expect(wordmark.locator('.wm-s')).toHaveCount(8);
  await expect(page.locator('[id="wmWobble"]')).toHaveCount(1);
  // The text wordmark it replaces is gone; the hero title is untouched.
  await expect(home).not.toContainText('sandbox');
  await expect(page.locator('.hero-card h1')).toContainText('Sandbox');
});

test('the wordmark draws itself in, then wiggles and boils', async ({ page }) => {
  await page.goto('/');
  const names = await page
    .locator('.wm-s')
    .first()
    .evaluate((el) => el.getAnimations().map((a) => /** @type {CSSAnimation} */ (a).animationName));
  expect(names).toEqual(['sbDraw', 'wmJig']);
  // Drawn in once loaded.
  await expect
    .poll(() =>
      page
        .locator('.wm-s')
        .last()
        .evaluate((el) => getComputedStyle(el).strokeDashoffset),
    )
    .toMatch(/^0(px)?$/);
  // The outline boils: the turbulence seed steps a few times a second.
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    seen.add(await seed(page));
    await page.waitForTimeout(160);
  }
  expect(seen.size).toBeGreaterThan(2);
});

test('the wordmark holds still, fully drawn, for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const strokes = page.locator('.wm-s');
  const animations = await strokes.evaluateAll((els) => els.flatMap((el) => el.getAnimations()).length);
  expect(animations).toBe(0);
  const offsets = await strokes.evaluateAll((els) => els.map((el) => getComputedStyle(el).strokeDashoffset));
  expect(offsets.every((o) => /^0(px)?$/.test(o))).toBe(true);
  const before = await seed(page);
  await page.waitForTimeout(600);
  expect(await seed(page)).toBe(before);
});

test.describe('at 375px wide', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('the wordmark fits the header', async ({ page }) => {
    await page.goto('/');
    const box = await page.locator('svg.wordmark').boundingBox();
    expect(box).not.toBeNull();
    expect(/** @type {{ x: number, width: number }} */ (box).x).toBeGreaterThanOrEqual(0);
    expect(
      /** @type {{ x: number, width: number }} */ (box).x + /** @type {{ width: number }} */ (box).width,
    ).toBeLessThanOrEqual(375);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
