import { expect, test } from '@playwright/test';

/** Where the shared wobble filter's noise has drifted to. @param {import('@playwright/test').Page} page */
const drift = (page) => page.locator('#wmDrift').evaluate((el) => `${el.getAttribute('dx')},${el.getAttribute('dy')}`);

test('the crayon wordmark is the logo in the header, the hero title and the footer', async ({ page }) => {
  await page.goto('/');
  const home = page.locator('header.nav a.brand');
  await expect(home).toHaveAttribute('href', '#top');
  await expect(home).toHaveAccessibleName('Play by the Sandbox home');
  const header = home.locator('svg.wordmark');
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute('role', 'img');
  await expect(header).toHaveAttribute('aria-label', 'Sandbox');
  // s, a, n, d, b, o and the two strokes of the x.
  await expect(header.locator('.wm-s')).toHaveCount(8);
  // The old fish icon and text wordmark are gone.
  await expect(home.locator('svg')).toHaveCount(1);
  await expect(home).not.toContainText('sandbox');

  // The hero title reads "Play by the Sandbox" to search and screen readers.
  const title = page.locator('.hero-card h1');
  await expect(title.locator('svg.wordmark')).toBeVisible();
  await expect(title).toHaveText(/Play by the\s*Sandbox/);

  const footer = page.locator('footer svg.wordmark');
  await expect(footer).toHaveAttribute('aria-label', 'Sandbox');
  await expect(page.locator('footer')).not.toContainText('dragon');

  // Three wordmarks, one shared filter.
  await expect(page.locator('svg.wordmark')).toHaveCount(3);
  await expect(page.locator('[id="wmWobble"]')).toHaveCount(1);
});

test('the wordmarks draw themselves in, then wiggle and boil smoothly', async ({ page }) => {
  await page.goto('/');
  const names = await page
    .locator('header .wm-s')
    .first()
    .evaluate((el) => el.getAnimations().map((a) => /** @type {CSSAnimation} */ (a).animationName));
  expect(names).toEqual(['sbDraw']);
  await expect
    .poll(() =>
      page
        .locator('.hero-card .wm-s')
        .last()
        .evaluate((el) => getComputedStyle(el).strokeDashoffset),
    )
    .toMatch(/^0(px)?$/);
  // The outline boils by drifting the noise, and the letters wiggle.
  const first = await drift(page);
  await expect.poll(() => drift(page), { timeout: 5000 }).not.toBe(first);
  await expect(page.locator('header .wm-s').first()).toHaveAttribute('transform', /translate\(0 -?[\d.]+\) rotate/);

  // Smoothly: a quarter second apart, no letter has moved more than a pixel or two.
  const centres = () =>
    page.locator('header .wm-s').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return [r.x + r.width / 2, r.y + r.height / 2];
      }),
    );
  const a = await centres();
  await page.waitForTimeout(250);
  const b = await centres();
  const moved = Math.max(...a.map(([x, y], i) => Math.hypot(b[i][0] - x, b[i][1] - y)));
  expect(moved).toBeLessThan(2.5);
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
  await expect(page.locator('header .wm-s').first()).not.toHaveAttribute('transform', /./);
});

test.describe('at 375px wide', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('the wordmark fits the header', async ({ page }) => {
    await page.goto('/');
    const box = await page.locator('header svg.wordmark').boundingBox();
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
