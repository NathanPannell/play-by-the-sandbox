import { expect, test } from '@playwright/test';

// The wordmark's letters, exactly as the designer drew them.
const WORDMARK = ['#DE1B1B', '#DE761B', '#EEDD41', '#21B22D', '#1B8ADE', '#A47CDD', '#B221AD', '#B221AD'];

test('the pastel palette comes from the shared tokens file', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const tokens = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return ['--paper', '--ink', '--rose', '--sky-ink'].map((t) => css.getPropertyValue(t).trim());
  });
  expect(tokens).toEqual(['#fff8ef', '#3a3342', '#f6bbc6', '#36619a']);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 248, 239)');
});

test('headings and reading text are drawn in crayon, and the wordmark is untouched', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const filters = await page.evaluate(() => ({
    headings: [...document.querySelectorAll('h2.toon')].map((h) => getComputedStyle(h).filter),
    copy: [...document.querySelectorAll('.sv p')].map((p) => getComputedStyle(p).filter),
  }));
  expect(filters.headings.length).toBeGreaterThan(4);
  expect(filters.headings.every((f) => f.includes('#crayonType'))).toBe(true);
  expect(filters.copy.every((f) => f.includes('#crayonSoft'))).toBe(true);
  await expect(page.locator('filter#crayonType')).toHaveCount(1);
  await expect(page.locator('filter#crayonSoft')).toHaveCount(1);

  for (const mark of await page.locator('svg.wordmark').all()) {
    expect(await mark.locator('.wm-s').evaluateAll((els) => els.map((el) => el.getAttribute('stroke')))).toEqual(
      WORDMARK,
    );
  }
});

test('text meets WCAG AA contrast against its background', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const failures = await page.evaluate(() => {
    /** @param {string} c */
    const rgba = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    /** @param {number[]} c */
    const lum = ([r, g, b]) => {
      const f = (/** @type {number} */ v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    /** @param {Element} el */
    const backdrop = (el) => {
      for (let e = /** @type {Element | null} */ (el); e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c.length === 3 || c[3] === 1) return c;
      }
      return [255, 255, 255];
    };
    const out = [];
    for (const el of document.querySelectorAll('main, body *')) {
      if (el.closest('svg, script, style, .hero-scene, [hidden], .sr-only')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!own) continue;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
      const a = lum(rgba(cs.color)),
        b = lum(backdrop(el));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < (large ? 3 : 4.5))
        out.push(`${el.tagName} "${el.textContent?.trim().slice(0, 30)}" ${ratio.toFixed(2)}`);
    }
    return out;
  });
  expect(failures).toEqual([]);
});

test.describe('the glove cursor', () => {
  test.skip(({ isMobile }) => isMobile, 'fine pointers only');

  test('follows the mouse, points at links and squashes into a grab on click', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const glove = page.locator('.glove');
    await expect(glove).toHaveCount(1);
    await expect(glove).toHaveAttribute('aria-hidden', 'true');
    await expect(glove).toHaveCSS('pointer-events', 'none');
    await expect(glove).not.toHaveClass(/show/);

    await page.locator('#how').scrollIntoViewIfNeeded();
    await page.mouse.move(40, 40);
    await page.mouse.move(60, 60);
    await expect(glove).toHaveClass(/show/);
    await expect(glove).toHaveAttribute('data-pose', 'open');
    await expect(page.locator('html')).toHaveClass(/glove-on/);
    // The fingertip settles on the pointer.
    await expect
      .poll(() => glove.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41))
      .toBeCloseTo(50, 0);

    await page.locator('.toy').nth(1).hover();
    await expect(glove).toHaveAttribute('data-pose', 'point');
    await page.mouse.down();
    await expect(glove).toHaveAttribute('data-pose', 'grab');
    await expect(glove).toHaveClass(/press/);
    await page.mouse.up();
    await expect(glove).toHaveAttribute('data-pose', 'point');
    await expect(glove).not.toHaveClass(/press/);
  });

  test('stays away for reduced motion, keeping the native cursor', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.mouse.move(80, 80);
    await page.mouse.move(120, 120);
    await expect(page.locator('.glove')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/glove-on/);
  });
});

test('touch devices keep the native cursor', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch only');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.glove')).toHaveCount(0);
});

test('doodle creatures arrive as their sections scroll into view, and never block clicks', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const doodles = page.locator('.doodle');
  await expect(doodles).toHaveCount(6);
  expect(await doodles.evaluateAll((els) => els.every((el) => el.getAttribute('aria-hidden') === 'true'))).toBe(true);
  expect(await doodles.evaluateAll((els) => els.every((el) => getComputedStyle(el).pointerEvents === 'none'))).toBe(
    true,
  );

  const gull = page.locator('.doodle-gull');
  await expect(gull).not.toHaveClass(/\bon\b/);
  await gull.scrollIntoViewIfNeeded();
  await expect(gull).toHaveClass(/\bon\b/);
  await expect(gull).toHaveClass(/awake/);

  // Idle loops stop once the creature is off screen.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(gull).not.toHaveClass(/awake/);
  await expect(gull).toHaveClass(/\bon\b/);
});

test('Sandy peeks in from an edge once the hero is out of view', async ({ page }) => {
  await page.goto('/?doodle-debug', { waitUntil: 'domcontentloaded' });
  const peeker = page.locator('.peeker');
  await page.waitForTimeout(800);
  await expect(peeker).not.toHaveClass(/out/);
  await page.locator('#map').scrollIntoViewIfNeeded();
  await expect(peeker).toHaveClass(/out/, { timeout: 5000 });
  await expect(page.locator('.peek-stage')).toHaveCSS('pointer-events', 'none');
  expect(['bottom', 'left', 'right']).toContain(await peeker.getAttribute('data-side'));
  await expect(peeker).not.toHaveClass(/out/, { timeout: 8000 });
});

test('creatures are drawn and still for reduced motion, and Sandy stays home', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?doodle-debug', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.doodle.on')).toHaveCount(6);
  await page.locator('#map').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await expect(page.locator('.peeker')).toHaveCount(0);
  const running = await page
    .locator('.doodle')
    .evaluateAll((els) =>
      els.flatMap((el) => el.getAnimations({ subtree: true })).filter((a) => a.playState === 'running'),
    );
  expect(running).toHaveLength(0);
});
