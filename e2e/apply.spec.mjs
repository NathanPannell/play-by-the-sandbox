import { expect, test } from '@playwright/test';

// The local server (scripts/serve.mjs) gives the apply endpoints an in-memory
// database and this review password (playwright.config.mjs).
const SECRET = 'e2e-review-secret';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==',
  'base64',
);

/** @param {import('@playwright/test').Page} page */
function watchErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

const unique = (/** @type {string} */ name) => `${name} ${test.info().project.name} ${Date.now()}`;

/**
 * Picks an option from one of the pastel drop-downs (src/apply/listbox.js), the way a visitor does.
 * @param {import('@playwright/test').Page | import('@playwright/test').Locator} scope
 * @param {string | RegExp} name @param {string} option
 */
async function pick(scope, name, option) {
  await scope.getByRole('combobox', { name }).click();
  await scope.getByRole('option', { name: option, exact: true }).click();
}

test('the creator toy on the home page opens the creator form', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('footer a[href^="/apply/"]')).toHaveCount(0);
  const creators = page.locator('#toys .toy', { hasText: 'Creators' });
  await creators.scrollIntoViewIfNeeded();
  await creators.click();
  await page.getByRole('link', { name: 'Apply as an upcoming creator' }).click();
  await expect(page).toHaveURL(/\/apply\/creator$/);
  await expect(page.locator('h1')).toHaveText('Apply as an upcoming creator');
});

test('a creator applies with a photo and gets the thank-you card', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/apply/creator');
  await expect(page).toHaveTitle('Apply as an upcoming creator · Play by the Sandbox');

  // Nothing filled in: every required field explains itself, and focus goes to the first.
  await page.getByRole('button', { name: 'Send my application' }).click();
  await expect(page.locator('#formError')).toHaveText('A few things need fixing. They’re marked in red.');
  await expect(page.locator('#f-name-err')).toHaveText('Please fill this in.');
  await expect(page.locator('#f-consent-err')).toHaveText('Please tick this box to send your application.');
  await expect(page.locator('#f-name')).toBeFocused();
  await expect(page.locator('#f-name')).toHaveAttribute('aria-invalid', 'true');

  const name = unique('Robin');
  await page.getByLabel('Your name').fill(name);
  await expect(page.locator('#f-name-err')).toBeHidden();
  await page.getByLabel('Email').fill('robin@example.com');
  await page.getByLabel('Where are you based?').fill('Vancouver, BC');
  await page.getByText('Photography', { exact: true }).click();
  await page.getByText('Writing', { exact: true }).click();

  const rows = page.locator('[data-field="socials"] .link-row');
  await expect(rows).toHaveCount(2);
  await rows.nth(0).getByLabel('Link or @handle').fill('@robin.makes');
  await page.getByRole('button', { name: '+ add another link' }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2).getByRole('combobox', { name: 'Platform' })).toHaveText('Website');
  await expect(rows.nth(2).locator('select')).toHaveValue('Website');
  await expect(rows.nth(2).getByLabel('Link or @handle')).toBeFocused();
  await rows.nth(2).getByLabel('Link or @handle').fill('robin.example.com');
  await rows.nth(1).getByRole('button', { name: 'Remove this link' }).click();
  await expect(rows).toHaveCount(2);

  // Photos over 5 MB are refused before sending; a small one shows a preview.
  const photo = page.getByLabel('A photo or headshot');
  await photo.setInputFiles({ name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.locator('#f-photo-err')).toHaveText('That photo is 5.0 MB. Please pick one under 5 MB.');
  await photo.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#f-photo-err')).toBeHidden();
  await expect(page.locator('.preview img')).toBeVisible();

  await page.getByLabel('Tell us about you').fill('I make things.\nLots of things.');
  await expect(page.locator('[data-count-for="f-about"]')).toHaveText('30');
  await page.getByLabel('What would you want to make with Sandbox?').fill('A crayon campaign.');
  await page.getByLabel(/happy for the Sandbox team/).check();
  await page.getByRole('button', { name: 'Send my application' }).click();

  const thanks = page.locator('#thanks');
  await expect(thanks).toBeVisible();
  await expect(thanks.locator('h2')).toHaveText('Got it, Robin!');
  await expect(thanks).toContainText('robin@example.com');
  await expect(page.locator('#applyForm')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a brand applies, and the team reviews it', async ({ page }) => {
  const errors = watchErrors(page);
  const brand = unique('Crayon Co.');
  await page.goto('/apply/brand');
  await page.getByLabel('Brand name').fill(brand);
  await pick(page, /^Category/, 'Arts & culture');
  await pick(page, /^Stage/, 'Idea or pre-launch');
  await page.getByLabel('Your name').fill('Sam Lee');
  await page.getByLabel('Email').fill('sam@crayon.example.com');
  await page.locator('[data-field="socials"] .link-row').first().getByLabel('Link or @handle').fill('@crayonco');
  await page.getByLabel('A logo or photo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await page.getByLabel('About the brand').fill('We make crayons.');
  await page.getByLabel('What are you looking for from Sandbox?').fill('A launch moment.');
  await page.getByLabel(/happy for the Sandbox team/).check();
  await page.getByRole('button', { name: 'Send my application' }).click();
  await expect(page.locator('#thanks h2')).toHaveText('Got it, Sam!');

  await page.goto('/apply/review');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  await page.getByLabel('Review password').fill('not it');
  await page.getByRole('button', { name: 'Open the pile' }).click();
  await expect(page.locator('#secret-err')).toHaveText('That password didn’t work. Try again?');

  await page.getByLabel('Review password').fill(SECRET);
  await page.getByRole('button', { name: 'Open the pile' }).click();
  const card = page.locator('.card', { hasText: brand });
  await expect(card).toBeVisible();
  await expect(card.locator('.badge')).toHaveText('brand');
  await expect(card.getByRole('link', { name: 'https://www.instagram.com/crayonco/' })).toHaveAttribute(
    'rel',
    'noopener noreferrer nofollow ugc',
  );
  await expect(card).toContainText('Arts & culture');
  await expect
    .poll(() => card.locator('img.photo').evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth))
    .toBe(1);

  await card.getByRole('button', { name: 'shortlisted' }).click();
  await expect(card.getByRole('button', { name: 'shortlisted' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(card.getByRole('button', { name: 'shortlisted' })).toHaveAttribute('aria-pressed', 'true');

  await pick(page, /^Show/, 'creators');
  await expect(card).toHaveCount(0);
  await pick(page, /^Show/, 'brands');
  await pick(page, /^Status/, 'shortlisted');
  await expect(card).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await card.getByRole('button', { name: 'Delete' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#board')).toBeVisible();
  await expect(card).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#board')).toBeHidden();
  // The wrong password was a 401 the page handled; that's the only error.
  expect(errors.filter((e) => !e.includes('401'))).toEqual([]);
});

for (const path of ['/apply/creator', '/apply/brand', '/apply/review']) {
  test(`${path} fits the screen and uses the site's palette`, async ({ page }) => {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // On the site's palette (/styles/tokens.css), lettered by hand in solid ink: no texture on any text.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 248, 239)');
    expect(await page.locator('h1').evaluate((h) => getComputedStyle(h).fontFamily)).toContain('Gochi Hand');
    expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Patrick Hand');
    const textured = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => !el.closest('svg, .glove') && getComputedStyle(el).filter !== 'none')
        .map((el) => el.tagName + '.' + el.className),
    );
    expect(textured).toEqual([]);
    await page.waitForFunction(
      () => document.fonts.check('20px "Gochi Hand"') && document.fonts.check('20px "Patrick Hand"'),
    );
    // The glove cursor draws through #crayonSoft, so each page carries that filter.
    await expect(page.locator('filter#crayonSoft')).toHaveCount(1);
  });
}

for (const path of ['/apply/creator', '/apply/brand']) {
  test(`${path}: the consent tick sits beside its sentence, which wraps in a hanging indent`, async ({ page }) => {
    await page.goto(path);
    const label = page.locator('.consent label');
    await label.scrollIntoViewIfNeeded();
    const { box, lines, spacing } = await label.evaluate((el) => {
      const input = /** @type {HTMLElement} */ (el.querySelector('input'));
      const span = /** @type {HTMLElement} */ (el.querySelector('span'));
      const range = document.createRange();
      range.selectNodeContents(span);
      return {
        box: input.getBoundingClientRect().toJSON(),
        lines: [...range.getClientRects()].map((r) => r.toJSON()),
        spacing: getComputedStyle(span).letterSpacing,
      };
    });
    expect(spacing).toBe('normal');
    // The first line of text shares a row with the tick box…
    expect(lines[0].top).toBeLessThan(box.bottom);
    expect(lines[0].bottom).toBeGreaterThan(box.top);
    // …and every line, wrapped ones included, starts right of it.
    for (const line of lines) expect(line.left).toBeGreaterThanOrEqual(box.right);
  });
}

test('the drop-downs are pastel listboxes that work from the keyboard, like a select', async ({ page }) => {
  await page.goto('/apply/brand');
  // The OS's select list never opens: the selects are hidden, holding the values.
  expect(
    await page.locator('select').evaluateAll((els) => els.every((el) => /** @type {HTMLSelectElement} */ (el).hidden)),
  ).toBe(true);
  const box = page.getByRole('combobox', { name: /^Category/ });
  const select = page.locator('select[name="category"]');
  await expect(box).toHaveAttribute('aria-expanded', 'false');
  await expect(box).toHaveText('Choose one…');

  // Required and empty: the same error, mirrored onto the combobox, and focus lands there when it's first.
  await page.getByRole('button', { name: 'Send my application' }).click();
  await expect(box).toHaveAttribute('aria-invalid', 'true');
  const describedBy = String(await box.getAttribute('aria-describedby'));
  await expect(page.locator(`[data-field="category"] .err`)).toHaveText(/./);
  expect(describedBy).toContain(String(await page.locator('[data-field="category"] .err').getAttribute('id')));

  await box.focus();
  await page.keyboard.press('ArrowDown');
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  const list = page.getByRole('listbox', { name: 'Category' });
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(list.locator('.lb-active')).toHaveText('Beauty & wellness');
  await expect(box).toHaveAttribute(
    'aria-activedescendant',
    String(await list.locator('.lb-active').getAttribute('id')),
  );
  await page.keyboard.press('Enter');
  await expect(box).toHaveAttribute('aria-expanded', 'false');
  await expect(box).toBeFocused();
  await expect(box).toHaveText('Beauty & wellness');
  await expect(select).toHaveValue('Beauty & wellness');
  // Choosing clears the error, as typing does in a text field.
  await expect(box).not.toHaveAttribute('aria-invalid', 'true');

  // Escape closes without changing; type-ahead jumps; Space chooses; End and Home.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(select).toHaveValue('Beauty & wellness');
  await page.keyboard.press('t');
  await expect(list.locator('.lb-active')).toHaveText('Tech & apps');
  await page.keyboard.press(' ');
  await expect(select).toHaveValue('Tech & apps');
  await page.keyboard.press('Home');
  await expect(list.locator('.lb-active')).toHaveText('Choose one…');
  await page.keyboard.press('Escape');

  // And with a pointer or a finger.
  await pick(page, /^Stage/, 'Growing (1 to 3 years)');
  await expect(page.locator('select[name="stage"]')).toHaveValue('Growing (1 to 3 years)');
});

test.describe('the glove on the forms', () => {
  test.skip(({ isMobile }) => isMobile, 'fine pointers only');

  test('stays on over text fields (holding a crayon), drop-down options and the file picker', async ({ page }) => {
    await page.goto('/apply/brand');
    const glove = page.locator('.glove');
    for (const [field, pose] of /** @type {const} */ ([
      [page.getByLabel('Brand name'), 'write'],
      [page.getByLabel('About the brand'), 'write'],
      [page.getByLabel('A logo or photo'), 'point'],
      [page.getByRole('combobox', { name: /^Category/ }), 'point'],
    ])) {
      await field.scrollIntoViewIfNeeded();
      await field.hover();
      await expect(glove).toHaveClass(/show/);
      await expect(glove).toHaveAttribute('data-pose', pose);
      expect(await field.evaluate((el) => getComputedStyle(el).cursor)).toBe('none');
    }
    await page.getByRole('combobox', { name: /^Category/ }).click();
    await page.getByRole('option', { name: 'Food & drink' }).hover();
    await expect(glove).toHaveClass(/show/);
    await expect(glove).toHaveAttribute('data-pose', 'point');
  });
});
