import { expect, test } from '@playwright/test';
import { PAPERS, seamScore } from '../tools/seams.mjs';

/** @param {import('@playwright/test').Page} page */
const frames = (page) =>
  page.locator('#heroScene canvas.hero-canvas').evaluate((c) => Number(/** @type {HTMLElement} */ (c).dataset.frames));

/** @param {import('@playwright/test').Page} page */
const isPhone = (page) => (page.viewportSize()?.width ?? 1000) <= 600;

test('the nav chips carry letter shortcuts that jump to their sections', async ({ page }) => {
  await page.goto('/');
  const chips = page.locator('.hud-nav a[data-key]');
  await expect(chips).toHaveCount(5);
  for (const [key, href] of [
    ['H', '#how'],
    ['R', '#map'],
    ['T', '#toys'],
    ['W', '#wishlist'],
    ['A', '#toys'],
  ]) {
    const chip = page.locator(`.hud-nav a[data-key="${key.toLowerCase()}"]`);
    await expect(chip).toHaveAttribute('href', href);
    await expect(chip.locator('kbd')).toHaveText(key);
  }
  // Apply is the primary chip.
  await expect(page.locator('.hud-nav .chip-go')).toContainText('Apply');

  await page.keyboard.press('w');
  await expect(page).toHaveURL(/#wishlist$/);
  await expect(page.locator('#wishlist')).toBeInViewport();
});

test('the shortcuts can be turned off, and stay off', async ({ page }) => {
  await page.goto('/');
  const off = page.locator('#kbdToggle');
  await off.scrollIntoViewIfNeeded();
  await expect(off).toHaveText('Turn off keyboard shortcuts');
  await off.click();
  await expect(off).toHaveText('Turn on keyboard shortcuts');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('w');
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('.hud-nav kbd').first()).toBeHidden();
  await page.reload();
  await page.keyboard.press('w');
  expect(new URL(page.url()).hash).toBe('');
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

test('shortcuts stay out of the way while typing, or with a modifier held', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'typing';
    document.body.prepend(input);
  });
  await page.locator('#typing').focus();
  await page.keyboard.type('what');
  await expect(page.locator('#typing')).toHaveValue('what');
  expect(new URL(page.url()).hash).toBe('');
  await page.locator('#typing').blur();
  await page.keyboard.press('Control+r').catch(() => {});
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

  // The P shortcut does the same.
  await page.keyboard.press('p');
  await expect(scene).toHaveAttribute('data-state', 'running');
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

test('graphics QA: the crayon paper has no tiling seams', async ({ page }) => {
  // The pass alone over flat colours, high-passed, checked for repeats at
  // shifts of 8 to 128 pixels. The old float-hash grain repeated every few
  // dozen pixels and scored 0.2 to 0.45 here; random grain stays near 0.02.
  test.setTimeout(90_000);
  // The full tier, so CI's software renderer still draws at the device's own
  // pixel ratio (1 on desktop, 1.5 on the phone profile).
  await page.goto('/?hero-debug&hero-tier=full');
  await expect(page.locator('#heroScene')).toHaveClass(/ready/);
  for (const [name, rgb] of Object.entries(PAPERS)) {
    const { score, lag } = await seamScore(page, rgb);
    expect(score, `${name} paper repeats every ${lag}px`).toBeLessThan(0.1);
  }
});
