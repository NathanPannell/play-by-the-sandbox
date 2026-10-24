// Browser script for /apply/review (bundled to dist/apply/review.js): the
// team's list of applications, newest first, with a status per application.
// The password is the REVIEW_SECRET env var. It's kept in sessionStorage for
// this tab only and sent as a bearer token to /api/review.
import { FORMS, STATUSES } from './forms.js';
import { enhanceSelects } from './listbox.js';

const KEY = 'sandbox-review-secret';
const login = /** @type {HTMLFormElement} */ (document.getElementById('login'));
const secretInput = /** @type {HTMLInputElement} */ (document.getElementById('secret'));
const loginError = /** @type {HTMLElement} */ (document.getElementById('secret-err'));
const board = /** @type {HTMLElement} */ (document.getElementById('board'));
const list = /** @type {HTMLOListElement} */ (document.getElementById('list'));
const summary = /** @type {HTMLElement} */ (document.getElementById('summary'));
const filterKind = /** @type {HTMLSelectElement} */ (document.getElementById('filterKind'));
const filterStatus = /** @type {HTMLSelectElement} */ (document.getElementById('filterStatus'));
// Pastel drop-downs for the filters (listbox.js).
enhanceSelects(board);

/**
 * @typedef {{ id: string, kind: 'creator' | 'brand', name: string, email: string, status: string,
 *   answers: Record<string, unknown>, has_photo: boolean, created_at: string }} Application
 */
/** @type {Application[]} */
let apps = [];

/** @returns {string | null} */
function secret() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** @param {string | null} value */
function remember(value) {
  try {
    if (value) sessionStorage.setItem(KEY, value);
    else sessionStorage.removeItem(KEY);
  } catch {
    // Private mode: the password lasts until the page is reloaded.
  }
  current = value;
}
let current = secret();

/** @param {string} path @param {RequestInit} [init] */
async function api(path, init = {}) {
  const res = await fetch(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${current}` } });
  if (res.status === 401) {
    signOut('That password didn’t work. Try again?');
    throw new Error('unauthorized');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? `Error ${res.status}`);
  return res;
}

/** @param {string} [message] */
function signOut(message) {
  remember(null);
  board.hidden = true;
  login.hidden = false;
  list.replaceChildren();
  loginError.textContent = message ?? '';
  loginError.hidden = !message;
  secretInput.focus();
}

async function load() {
  summary.textContent = 'Loading…';
  try {
    const res = await api('/api/review');
    apps = (await res.json()).applications;
    login.hidden = true;
    board.hidden = false;
    render();
  } catch (e) {
    if (/** @type {Error} */ (e).message !== 'unauthorized')
      summary.textContent = `Couldn’t load: ${/** @type {Error} */ (e).message}`;
  }
}

/** @param {string} tag @param {Record<string, string>} [attrs] @param {(Node | string)[]} [children] */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

/** Only http(s) links become clickable. @param {unknown} url */
function safeLink(url, text = String(url)) {
  const s = String(url);
  return /^https?:\/\//i.test(s)
    ? el('a', { href: s, target: '_blank', rel: 'noopener noreferrer nofollow ugc' }, [text])
    : text;
}

/** @param {import('./forms.js').Field} f @param {unknown} value @returns {Node | string} */
function answer(f, value) {
  if (f.type === 'links') {
    const links = /** @type {{ platform: string, url: string }[]} */ (value);
    return el(
      'ul',
      { class: 'answer-links' },
      links.map((l) => el('li', {}, [`${l.platform}: `, safeLink(l.url)])),
    );
  }
  if (Array.isArray(value)) return value.join(', ');
  if (f.type === 'url') return safeLink(value);
  return String(value);
}

/** Photos as blob: URLs, fetched once per application. @type {Map<string, Promise<string>>} */
const photos = new Map();

/** @param {Application} app @param {HTMLImageElement} img */
async function loadPhoto(app, img) {
  let url = photos.get(app.id);
  if (!url) {
    url = api(`/api/review-photo?id=${encodeURIComponent(app.id)}`).then(async (res) =>
      URL.createObjectURL(await res.blob()),
    );
    photos.set(app.id, url);
  }
  try {
    img.src = await url;
  } catch {
    photos.delete(app.id);
    img.alt = 'Photo couldn’t load';
  }
}

/** @param {Application} app */
function card(app) {
  const form = FORMS[app.kind];
  const when = new Date(app.created_at);
  const head = el('div', { class: 'card-head' }, [
    el('span', { class: `badge badge-${app.kind}` }, [app.kind]),
    el('h2', {}, [app.name]),
    el('p', { class: 'meta' }, [
      el('a', { href: `mailto:${app.email}` }, [app.email]),
      ' · ',
      el('time', { datetime: when.toISOString() }, [
        when.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }),
      ]),
    ]),
  ]);

  const status = el('div', { class: 'status', role: 'group', 'aria-label': `Status of ${app.name}` });
  for (const s of STATUSES) {
    const btn = el('button', { type: 'button', class: `st st-${s}`, 'aria-pressed': String(app.status === s) }, [s]);
    btn.addEventListener('click', async () => {
      if (app.status === s) return;
      try {
        await api('/api/review', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: app.id, status: s }),
        });
        app.status = s;
        render();
      } catch (e) {
        if (/** @type {Error} */ (e).message !== 'unauthorized')
          alert(`Couldn’t update: ${/** @type {Error} */ (e).message}`);
      }
    });
    status.append(btn);
  }

  const del = el('button', { type: 'button', class: 'del' }, ['Delete']);
  del.addEventListener('click', async () => {
    if (!confirm(`Delete ${app.name}’s application for good? This can’t be undone.`)) return;
    try {
      await api(`/api/review?id=${encodeURIComponent(app.id)}`, { method: 'DELETE' });
      apps = apps.filter((a) => a.id !== app.id);
      render();
    } catch (e) {
      if (/** @type {Error} */ (e).message !== 'unauthorized')
        alert(`Couldn’t delete: ${/** @type {Error} */ (e).message}`);
    }
  });

  const details = el('dl', { class: 'answers' });
  for (const f of form.fields) {
    const value = app.answers[f.name];
    if (['photo', 'consent'].includes(f.type) || f.name === form.nameField || f.name === form.emailField) continue;
    if (value === undefined || value === '') continue;
    details.append(el('dt', {}, [f.label]), el('dd', {}, [answer(f, value)]));
  }

  const li = el('li', { class: `card paper status-${app.status}` });
  if (app.has_photo) {
    const img = /** @type {HTMLImageElement} */ (el('img', { class: 'photo', alt: `Photo from ${app.name}` }));
    loadPhoto(app, img);
    li.append(img);
  }
  li.append(el('div', { class: 'card-body' }, [head, status, details, del]));
  return li;
}

function render() {
  const shown = apps.filter(
    (a) =>
      (!filterKind.value || a.kind === filterKind.value) && (!filterStatus.value || a.status === filterStatus.value),
  );
  const count = (/** @type {string} */ s) => apps.filter((a) => a.status === s).length;
  summary.textContent = `${apps.length} application${apps.length === 1 ? '' : 's'}: ${STATUSES.map((s) => `${count(s)} ${s}`).join(', ')}. Showing ${shown.length}.`;
  list.replaceChildren(...shown.map(card));
}

login.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.hidden = true;
  remember(secretInput.value);
  secretInput.value = '';
  load();
});
filterKind.addEventListener('change', render);
filterStatus.addEventListener('change', render);
/** @type {HTMLElement} */ (document.getElementById('refresh')).addEventListener('click', load);
/** @type {HTMLElement} */ (document.getElementById('signOut')).addEventListener('click', () => signOut());

if (current) load();
else secretInput.focus();
