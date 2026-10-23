// Checks a form's answers against its config (src/apply/forms.js). The same
// code runs in the browser, for instant messages, and in api/apply.js, where it
// is the check that counts. It returns cleaned values (trimmed, links made
// absolute) and a friendly message per field that's wrong.

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const HANDLE = /^@?[\w.]{1,60}$/;
// Everything below a space except tab and newline, plus DEL.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const MAX_LINK = 300;

/** @type {Record<string, (handle: string) => string>} */
const HANDLE_URLS = {
  Instagram: (h) => `https://www.instagram.com/${h}/`,
  TikTok: (h) => `https://www.tiktok.com/@${h}`,
  YouTube: (h) => `https://www.youtube.com/@${h}`,
};

/**
 * An http(s) URL with a dotted host, or null. Adds https:// when it's missing.
 * @param {string} raw
 */
export function normalizeUrl(raw) {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z\d+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname.includes('.') || url.username || url.password) return null;
  return url.href;
}

/**
 * A social link, also accepting an @handle for the platforms that have them.
 * @param {string} platform
 * @param {string} raw
 */
export function normalizeLink(platform, raw) {
  const s = raw.trim();
  const toUrl = HANDLE_URLS[platform];
  if (toUrl && HANDLE.test(s) && (s.startsWith('@') || !s.includes('.'))) return toUrl(s.replace(/^@/, ''));
  return normalizeUrl(s);
}

/** @param {unknown} raw @param {boolean} multiline */
function clean(raw, multiline) {
  if (typeof raw !== 'string') return '';
  const s = multiline ? raw.replace(/\r\n?/g, '\n') : raw.replace(/\s+/g, ' ');
  return s.replace(CONTROL, '').trim();
}

/**
 * @param {import('./forms.js').Field} field
 * @param {unknown} raw
 * @returns {{ value?: unknown, error?: string }}
 */
function check(field, raw) {
  switch (field.type) {
    case 'select': {
      const s = clean(raw, false);
      if (!s) return field.required ? { error: 'Please pick one.' } : {};
      return field.options?.includes(s) ? { value: s } : { error: 'Please pick one of the options.' };
    }
    case 'choices': {
      const picked = Array.isArray(raw) ? [...new Set(raw)].filter((o) => field.options?.includes(o)) : [];
      const min = field.min ?? (field.required ? 1 : 0);
      if (picked.length < min) return { error: min === 1 ? 'Pick at least one.' : `Pick at least ${min}.` };
      return picked.length ? { value: picked } : {};
    }
    case 'links':
      return checkLinks(field, raw);
    case 'consent':
      if (raw === true) return { value: true };
      return field.required ? { error: 'Please tick this box to send your application.' } : {};
    default:
      return checkText(field, raw);
  }
}

/** @param {import('./forms.js').Field} field @param {unknown} raw */
function checkText(field, raw) {
  const s = clean(raw, field.type === 'textarea');
  if (!s) {
    if (!field.required) return {};
    return { error: field.type === 'email' ? 'We need an email to reply to.' : 'Please fill this in.' };
  }
  const max = field.max ?? (field.type === 'textarea' ? 2000 : 200);
  if (s.length > max) return { error: `Keep it under ${max} characters (it’s ${s.length} now).` };
  if (field.type === 'email') return EMAIL.test(s) ? { value: s } : { error: 'That email doesn’t look right.' };
  if (field.type === 'url') {
    const url = normalizeUrl(s);
    return url ? { value: url } : { error: 'That link doesn’t look right.' };
  }
  return { value: s };
}

/** @param {import('./forms.js').Field} field @param {unknown} raw */
function checkLinks(field, raw) {
  const rows = Array.isArray(raw) ? raw : [];
  const maxRows = field.maxRows ?? 8;
  if (rows.length > maxRows) return { error: `Up to ${maxRows} links, please.` };
  const platforms = field.platforms ?? [];
  /** @type {{ platform: string, url: string }[]} */
  const links = [];
  for (const row of rows) {
    const r = row && typeof row === 'object' ? row : {};
    const text = clean(r.url, false);
    if (!text) continue;
    const platform = platforms.includes(r.platform) ? r.platform : 'Other';
    const url = text.length <= MAX_LINK ? normalizeLink(platform, text) : null;
    if (!url)
      return { error: `Check your ${platform} link: “${text.slice(0, 40)}” doesn’t look like a link or @handle.` };
    links.push({ platform, url });
  }
  const min = field.min ?? (field.required ? 1 : 0);
  if (links.length < min) return { error: 'Add at least one link.' };
  return links.length ? { value: links } : {};
}

/**
 * @param {import('./forms.js').Form} form
 * @param {unknown} data the answers, keyed by field name (photos are checked separately)
 * @returns {{ values: Record<string, unknown>, errors: Record<string, string> }}
 */
export function validate(form, data) {
  const answers = /** @type {Record<string, unknown>} */ (data && typeof data === 'object' ? data : {});
  /** @type {Record<string, unknown>} */
  const values = {};
  /** @type {Record<string, string>} */
  const errors = {};
  for (const field of form.fields) {
    if (field.type === 'photo') continue;
    const { value, error } = check(field, answers[field.name]);
    if (error) errors[field.name] = error;
    else if (value !== undefined) values[field.name] = value;
  }
  return { values, errors };
}
