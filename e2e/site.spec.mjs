import { expect, test } from '@playwright/test';

test('the page loads with its title, share card and no errors', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  await expect(page).toHaveTitle('Play by the Sandbox | Vancouver Creative Event, Jan 2027');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    'https://www.playbythesandbox.ca/api/og?v=3',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://playbythesandbox.ca/');
  // Wait for everything the page fetches: the load event, the web fonts, the
  // hero's first frame and the projector slide art. Not 'networkidle': the
  // WebGL scene keeps the renderer busy enough on CI's software GPU that
  // Chromium can go 30 s without reporting it.
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#heroScene')).toHaveClass(/ready/);
  await page.waitForFunction(() =>
    /** @type {PerformanceResourceTiming[]} */ (performance.getEntriesByType('resource')).some(
      (r) => r.name.endsWith('/wordmark.svg') && r.responseEnd > 0,
    ),
  );
  // Give the slide's onload redraw the same quiet half second networkidle used to.
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('grab a toy offers brands and creators, each with its application form', async ({ page }) => {
  await page.goto('/');
  const toys = page.locator('#toys .toy');
  await expect(toys).toHaveText(['Brands', 'Creators']);
  const cta = page.locator('#roleCta');
  await cta.scrollIntoViewIfNeeded();

  // Brands is picked to start with.
  await expect(toys.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#roleTitle')).toHaveText('Brands');
  await expect(cta).toHaveText('Apply as an upcoming brand →');
  await expect(cta).toHaveAttribute('href', '/apply/brand');
  await expect(cta).not.toHaveAttribute('target', /./);

  await toys.nth(1).click();
  await expect(toys.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(toys.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#roleTitle')).toHaveText('Creators');
  await expect(cta).toHaveText('Apply as an upcoming creator →');
  await expect(cta).toHaveAttribute('href', '/apply/creator');

  await toys.nth(0).click();
  await expect(cta).toHaveAttribute('href', '/apply/brand');
  // Nothing on the page points at the old Google Form any more.
  await expect(page.locator('a[href*="docs.google.com"]')).toHaveCount(0);
});

test('in-page navigation targets exist', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('a[href^="#"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of new Set(hrefs)) {
    await expect(page.locator(String(href)), `${href} target`).toHaveCount(1);
  }
});

test('the page animates, and holds still for reduced motion', async ({ page }) => {
  await page.goto('/');
  const animated = () =>
    page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'finished').length,
    );
  // The crayon draw-ins run, and the hero's 3D scene is playing (e2e/hero.spec.mjs covers it in depth).
  expect(await animated()).toBeGreaterThan(0);
  await expect(page.locator('#heroScene')).toHaveAttribute('data-state', 'running');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#heroScene')).toHaveAttribute('data-state', 'static');
  const running = await page.evaluate(
    () =>
      document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
        .length,
  );
  expect(running).toBe(0);
});

test('nothing overflows the viewport horizontally', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('icons, manifest, robots and sitemap are served', async ({ page, request }) => {
  await page.goto('/');
  const links = await page
    .locator('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]')
    .evaluateAll((ls) => ls.map((l) => l.getAttribute('href')));
  for (const path of [...links, '/robots.txt', '/sitemap.xml']) {
    const res = await request.get(String(path));
    expect(res.status(), String(path)).toBe(200);
  }
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://playbythesandbox.ca/sitemap.xml');
});

test('the share card image renders', async ({ request }) => {
  const res = await request.get('/api/og');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  expect((await res.body()).length).toBeGreaterThan(10000);
});
