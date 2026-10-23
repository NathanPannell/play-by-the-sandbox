import { HtmlValidate } from 'html-validate';
import { describe, expect, it } from 'vitest';
import { FORMS, formFor } from '../src/apply/forms.js';
import { esc, renderApplyPage, renderField, renderForm, renderReviewPage } from '../src/apply/render.js';
import { normalizeLink, normalizeUrl, validate } from '../src/apply/validate.js';
import { GOOD } from './apply-fixtures.mjs';

describe('form configs', () => {
  it.each(Object.values(FORMS))('$kind has unique field names that point at real fields', (form) => {
    const names = form.fields.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const key of /** @type {const} */ (['nameField', 'thanksField', 'emailField'])) {
      expect(names, key).toContain(form[key]);
    }
    expect(form.fields.find((f) => f.name === form.emailField)?.type).toBe('email');
    expect(form.fields.filter((f) => f.type === 'consent' && f.required)).toHaveLength(1);
    expect(form.fields.filter((f) => f.type === 'photo')).toHaveLength(1);
  });

  it('looks up a form by kind', () => {
    expect(formFor('creator')).toBe(FORMS.creator);
    expect(formFor('brand')).toBe(FORMS.brand);
    expect(formFor('admin')).toBeUndefined();
    expect(formFor(null)).toBeUndefined();
  });
});

describe('links', () => {
  it.each([
    ['instagram.com/robin', 'https://instagram.com/robin'],
    ['  http://Example.com/a b ', 'http://example.com/a%20b'],
    ['//robin.example.com', 'https://robin.example.com/'],
    ['HTTPS://robin.example.com', 'https://robin.example.com/'],
  ])('normalizes %j', (raw, url) => expect(normalizeUrl(raw)).toBe(url));

  it.each([
    '',
    '   ',
    'javascript:alert(1)',
    'mailto:a@b.com',
    'localhost:3000',
    'https://nodot',
    'https://u:p@x.com',
    'https://exa mple.com',
  ])('rejects %j', (raw) => expect(normalizeUrl(raw)).toBeNull());

  it.each([
    ['Instagram', '@robin.makes', 'https://www.instagram.com/robin.makes/'],
    ['Instagram', 'robin_makes', 'https://www.instagram.com/robin_makes/'],
    ['TikTok', '@robin', 'https://www.tiktok.com/@robin'],
    ['YouTube', 'robin', 'https://www.youtube.com/@robin'],
    ['Instagram', 'instagram.com/robin', 'https://instagram.com/robin'],
    ['Website', '@robin', null],
    ['Other', 'robin.example.com', 'https://robin.example.com/'],
  ])('%s %j becomes %j', (platform, raw, url) => expect(normalizeLink(platform, raw)).toBe(url));
});

describe('validate', () => {
  it('accepts good answers and cleans them', () => {
    const { values, errors } = validate(FORMS.creator, GOOD.creator);
    expect(errors).toEqual({});
    expect(values).toEqual({
      name: 'Robin Test',
      email: 'robin@example.com',
      location: 'Vancouver, BC',
      disciplines: ['Photography', 'Writing'],
      socials: [{ platform: 'Instagram', url: 'https://www.instagram.com/robin.makes/' }],
      portfolio: 'https://robin.example.com/work',
      about: 'I make things.\nLots of things.',
      pitch: 'A crayon campaign.',
      consent: true,
    });
    expect(validate(FORMS.brand, GOOD.brand).errors).toEqual({});
  });

  it('explains every missing required answer', () => {
    const { values, errors } = validate(FORMS.creator, {});
    expect(values).toEqual({});
    expect(errors).toEqual({
      name: 'Please fill this in.',
      email: 'We need an email to reply to.',
      location: 'Please fill this in.',
      disciplines: 'Pick at least one.',
      socials: 'Add at least one link.',
      about: 'Please fill this in.',
      pitch: 'Please fill this in.',
      consent: 'Please tick this box to send your application.',
    });
    expect(Object.keys(validate(FORMS.brand, null).errors)).toEqual([
      'brand',
      'category',
      'stage',
      'contactName',
      'email',
      'about',
      'lookingFor',
      'consent',
    ]);
  });

  it('checks formats, lengths and options', () => {
    const { errors } = validate(FORMS.brand, {
      ...GOOD.brand,
      email: 'sam@crayon',
      website: 'ftp://crayon.example.com',
      category: 'Weapons',
      brand: 'x'.repeat(121),
      about: 42,
      socials: [{ platform: 'Myspace', url: 'not a link' }],
    });
    expect(errors).toEqual({
      email: 'That email doesn’t look right.',
      website: 'That link doesn’t look right.',
      category: 'Please pick one of the options.',
      brand: 'Keep it under 120 characters (it’s 121 now).',
      about: 'Please fill this in.',
      socials: 'Check your Other link: “not a link” doesn’t look like a link or @handle.',
    });
  });

  it('limits link rows and link length, and skips junk rows', () => {
    const rows = Array.from({ length: 9 }, () => ({ platform: 'Website', url: 'a.com' }));
    expect(validate(FORMS.brand, { socials: rows }).errors.socials).toBe('Up to 8 links, please.');
    const long = [{ platform: 'Website', url: `https://a.com/${'x'.repeat(300)}` }];
    expect(validate(FORMS.brand, { socials: long }).errors.socials).toMatch(/^Check your Website link/);
    const junk = validate(FORMS.brand, { ...GOOD.brand, socials: [null, 'a.com', { url: 'b.com' }] });
    expect(junk.values.socials).toEqual([{ platform: 'Other', url: 'https://b.com/' }]);
    expect(validate(FORMS.brand, { ...GOOD.brand, socials: 'a.com' }).values.socials).toBeUndefined();
  });

  it('handles fields with optional settings left out', () => {
    /** @type {import('../src/apply/forms.js').Form} */
    const form = {
      ...FORMS.brand,
      fields: [
        { name: 'note', label: 'Note', type: 'textarea' },
        { name: 'short', label: 'Short', type: 'text' },
        { name: 'pick', label: 'Pick', type: 'select' },
        { name: 'many', label: 'Many', type: 'choices', options: ['a', 'b', 'c'], min: 2 },
        { name: 'opt', label: 'Opt', type: 'choices', options: ['a'] },
        { name: 'links', label: 'Links', type: 'links', required: true },
        { name: 'ok', label: 'OK', type: 'consent' },
      ],
    };
    const { values, errors } = validate(form, {
      note: 'n'.repeat(2001),
      short: 's'.repeat(201),
      pick: 'x',
      many: ['a'],
      opt: [],
      links: [{ platform: 'Website', url: 'a.com' }],
      ok: 'yes',
    });
    expect(errors).toEqual({
      note: 'Keep it under 2000 characters (it’s 2001 now).',
      short: 'Keep it under 200 characters (it’s 201 now).',
      pick: 'Please pick one of the options.',
      many: 'Pick at least 2.',
    });
    expect(values).toEqual({ links: [{ platform: 'Other', url: 'https://a.com/' }] });
  });

  it('strips control characters', () => {
    const { values } = validate(FORMS.creator, { ...GOOD.creator, pitch: 'a\u0000b\u0007c\td\ne' });
    expect(values.pitch).toBe('abc\td\ne');
  });
});

describe('rendered pages', () => {
  const html = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: { 'attr-quotes': 'off', 'doctype-style': 'off', 'no-inline-style': 'off' },
  });

  it.each([
    ['creator', renderApplyPage(FORMS.creator)],
    ['brand', renderApplyPage(FORMS.brand)],
    ['review', renderReviewPage()],
  ])('the %s page is valid HTML', async (_, page) => {
    const report = await html.validateString(page);
    expect(report.results.flatMap((r) => r.messages.map((m) => `${m.ruleId}: ${m.message}`))).toEqual([]);
  });

  it('renders every field from the config, with its label and limits', () => {
    const page = renderApplyPage(FORMS.creator);
    for (const f of FORMS.creator.fields) expect(page, f.name).toContain(`data-field="${f.name}"`);
    expect(page).toContain('<title>Apply as an upcoming creator · Play by the Sandbox</title>');
    expect(page).toContain('<link rel="canonical" href="https://playbythesandbox.ca/apply/creator">');
    expect(page).toContain('maxlength="2000"');
    expect(page).toContain('<option selected>Instagram</option>');
    expect(page).toContain(
      '<template><div class="link-row"><select name="socials.platform[]" aria-label="Platform"><option>Instagram</option><option>TikTok</option><option>YouTube</option><option selected>Website</option>',
    );
    expect(page).toContain('href="/apply/brand"');
    expect(page).toContain('name="nickname"');
  });

  it('keeps the review page out of search engines', () => {
    expect(renderReviewPage()).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(renderApplyPage(FORMS.brand)).toContain('<meta name="robots" content="index, follow">');
  });

  it('escapes text from the config', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    expect(renderField({ name: 'q', label: '<b>', type: 'text', placeholder: '"x"' })).toContain(
      '<label for="f-q">&lt;b&gt;</label><input type="text" id="f-q" name="q" placeholder="&quot;x&quot;" aria-describedby="f-q-err" maxlength="200">',
    );
  });

  it('renders field types with their defaults', () => {
    expect(renderField({ name: 'n', label: 'N', type: 'textarea' })).toContain('rows="4" maxlength="2000"');
    expect(renderField({ name: 's', label: 'S', type: 'select' })).toContain(
      '<option value="">Choose one…</option></select>',
    );
    expect(renderField({ name: 'c', label: 'C', type: 'choices' })).toContain('<div class="picks"></div>');
    const links = renderField({ name: 'l', label: 'L', type: 'links', platforms: ['A', 'B'] });
    expect(links).toContain('data-max-rows="8"');
    expect(links.match(/<option selected>A<\/option>/g)).toHaveLength(2);
    expect(renderField({ name: 'u', label: 'U', type: 'url', required: true })).toContain(
      'type="text" inputmode="url" id="f-u" name="u" required',
    );
  });

  it('groups fields under numbered sections, and fields before any section in a plain group', () => {
    const form = renderForm({
      ...FORMS.brand,
      fields: [
        { name: 'a', label: 'A', type: 'text' },
        { section: 'One', name: 'b', label: 'B', type: 'text' },
        { section: 'Two', name: 'c', label: 'C', type: 'text' },
      ],
    });
    expect(form).toContain('<div class="sec"><div class="field" data-field="a">');
    expect(form).toContain('<legend><span class="num">1</span>One</legend>');
    expect(form).toContain('<legend><span class="num">2</span>Two</legend>');
  });
});
