import { expect, test } from '@playwright/test';

/** @param {import('@playwright/test').Page} page */
const frames = (page) =>
  page.locator('#heroScene canvas.hero-canvas').evaluate((c) => Number(/** @type {HTMLElement} */ (c).dataset.frames));

/** @param {import('@playwright/test').Page} page */
const isPhone = (page) => (page.viewportSize()?.width ?? 1000) <= 600;

test('the nav chips link to their sections', async ({ page }) => {
  await page.goto('/');
  const chips = page.locator('.hud-nav a.chip');
  await expect(chips).toHaveCount(5);
  for (const [name, href] of [
    ['how it goes', '#how'],
    ['the runway', '#map'],
    ['grab a toy', '#toys'],
    ['wishlist', '#wishlist'],
    ['Apply', '#toys'],
  ])
    await expect(page.locator('.hud-nav').getByRole('link', { name, includeHidden: true })).toHaveAttribute(
      'href',
      href,
    );
  // Apply is the primary chip.
  await expect(page.locator('.hud-nav .chip-go')).toContainText('Apply');
});

test('the site has no letter shortcuts: H, R, T, W, A and P do nothing', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('#heroScene');
  await expect(scene).toHaveAttribute('data-state', 'running');
  // No key badges, no advertised shortcuts and no switch to turn them off.
  await expect(page.locator('kbd, [data-key], [aria-keyshortcuts], #kbdToggle')).toHaveCount(0);
  // After each key, give a late handler a moment, then check nothing moved:
  // no jump to a section, no scroll, and the scene still turning (a P that
  // paused and a Shift+P that resumed would otherwise cancel out).
  for (const key of ['h', 'r', 't', 'w', 'a', 'p', 'Shift+H', 'Shift+P']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
    expect(new URL(page.url()).hash).toBe('');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await scene.getAttribute('data-state')).toBe('running');
  }
});

test('odd keys do nothing and break nothing', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  for (const key of ['"', '\\', 'Shift+Quote', 'x', '1']) await page.keyboard.press(key);
  expect(errors).toEqual([]);
  expect(new URL(page.url()).hash).toBe('');
});

test('on phones the links fold into a menu chip, and Apply stays out', async ({ page }) => {
  test.skip(!isPhone(page), 'phone layout');
  await page.goto('/');
  const menu = page.locator('.hud-menu');
  const links = page.locator('#hudLinks');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(links).toBeHidden();
  await expect(page.locator('.hud-nav .chip-go')).toBeVisible();

  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(links).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(links).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await links.getByRole('link', { name: /the runway/ }).click();
  await expect(page).toHaveURL(/#map$/);
  await expect(links).toBeHidden();
});

test('on desktop the links sit in a row, with no menu chip', async ({ page }) => {
  test.skip(isPhone(page), 'desktop layout');
  await page.goto('/');
  await expect(page.locator('.hud-menu')).toBeHidden();
  await expect(page.locator('#hudLinks')).toBeVisible();
});

test('the pause control stops and restarts the turning scene', async ({ page }) => {
  await page.goto('/');
  const scene = page.locator('#heroScene');
  const toggle = page.locator('#heroPause');
  await expect(scene).toHaveAttribute('data-state', 'running');
  await expect(toggle).toHaveAccessibleName('Pause the scene');

  await toggle.click();
  await expect(scene).toHaveAttribute('data-state', 'paused');
  await expect(toggle).toHaveAccessibleName('Play the scene');
  const held = await frames(page);
  await page.waitForTimeout(700);
  expect(await frames(page)).toBe(held);

  await toggle.click();
  await expect(scene).toHaveAttribute('data-state', 'running');
  await expect(toggle).toHaveAccessibleName('Pause the scene');
  await expect.poll(() => frames(page), { timeout: 15000 }).toBeGreaterThan(held);
});

test('with reduced motion the scene starts still, and Play is the visitor’s choice', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const scene = page.locator('#heroScene');
  const toggle = page.locator('#heroPause');
  await expect(scene).toHaveAttribute('data-state', 'static');
  await expect(toggle).toHaveAccessibleName('Play the scene');
  await toggle.click();
  await expect(scene).toHaveAttribute('data-state', 'running');
});

test('a speech bubble points at the marquee while it is in view', async ({ page }) => {
  await page.goto('/?hero-debug');
  await expect(page.locator('#heroScene')).toHaveClass(/ready/);
  const bubble = page.locator('#heroCallout');
  // Facing away from the gallery, no bubble.
  await page.evaluate(() => /** @type {any} */ (window).__hero.draw(11.2 + 37.5));
  await expect(bubble).toBeHidden();
  // Facing it, a bubble inside the hero, with its tail by the sign's corner.
  await page.evaluate(() => /** @type {any} */ (window).__hero.draw(11.2 + 4));
  await expect(bubble).toBeVisible();
  const box = await bubble.boundingBox();
  const size = page.viewportSize();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size?.width ?? 0);
});
