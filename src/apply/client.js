// Browser script for /apply/creator and /apply/brand (bundled to
// dist/apply/apply.js). The page's fields are rendered at build time from
// forms.js; this adds the link rows, character counts, photo preview, checks
// with the same validate() the server uses, sends the application and shows
// the thank-you card.
import { FORMS, PHOTO } from './forms.js';
import { enhanceSelects } from './listbox.js';
import { validate } from './validate.js';

const formEl = /** @type {HTMLFormElement} */ (document.getElementById('applyForm'));
const config = FORMS[/** @type {'creator' | 'brand'} */ (formEl.dataset.kind)];
const formError = /** @type {HTMLElement} */ (document.getElementById('formError'));
const submitBtn = /** @type {HTMLButtonElement} */ (formEl.querySelector('button[type="submit"]'));
/** @type {Blob | null} */
let photo = null;

// Pastel drop-downs instead of the OS's select lists (listbox.js).
enhanceSelects(formEl);

/** @param {string} name */
const fieldEl = (name) => /** @type {HTMLElement} */ (formEl.querySelector(`[data-field="${name}"]`));

/** @param {string} name @param {string} [message] */
function setError(name, message) {
  const field = fieldEl(name);
  const err = /** @type {HTMLElement} */ (field.querySelector('.err'));
  err.textContent = message ?? '';
  err.hidden = !message;
  field.classList.toggle('bad', !!message);
  for (const el of field.querySelectorAll('input:not([type="checkbox"]), textarea, select')) {
    if (message) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
}

// Link rows: add, remove, and hide "add" at the limit.
for (const box of formEl.querySelectorAll('[data-max-rows]')) {
  const rows = /** @type {HTMLElement} */ (box.querySelector('.links'));
  const add = /** @type {HTMLButtonElement} */ (box.querySelector('[data-add-row]'));
  const tpl = /** @type {HTMLTemplateElement} */ (box.querySelector('template'));
  const max = Number(/** @type {HTMLElement} */ (box).dataset.maxRows);
  const sync = () => (add.hidden = rows.children.length >= max);
  add.addEventListener('click', () => {
    rows.append(tpl.content.cloneNode(true));
    enhanceSelects(rows);
    sync();
    /** @type {HTMLElement} */ (rows.lastElementChild?.querySelector('input'))?.focus();
  });
  rows.addEventListener('click', (e) => {
    const btn = /** @type {HTMLElement} */ (e.target).closest('[data-remove-row]');
    if (!btn) return;
    const row = /** @type {HTMLElement} */ (btn.closest('.link-row'));
    if (rows.children.length > 1) row.remove();
    else /** @type {HTMLInputElement} */ (row.querySelector('input')).value = '';
    sync();
    add.focus();
  });
  sync();
}

// Character counts under the long answers.
for (const out of formEl.querySelectorAll('[data-count-for]')) {
  const area = /** @type {HTMLTextAreaElement} */ (
    document.getElementById(/** @type {string} */ (/** @type {HTMLElement} */ (out).dataset.countFor))
  );
  const update = () => (out.textContent = String(area.value.length));
  area.addEventListener('input', update);
  update();
}

// Photo: check it, preview it, and shrink big ones before sending.
const photoField = /** @type {HTMLElement | null} */ (formEl.querySelector('.field.photo'));
if (photoField) {
  const input = /** @type {HTMLInputElement} */ (photoField.querySelector('input[type="file"]'));
  const preview = /** @type {HTMLElement} */ (photoField.querySelector('.preview'));
  const img = document.createElement('img');
  img.alt = 'Preview of your photo';
  preview.prepend(img);
  const name = /** @type {string} */ (photoField.dataset.field);
  const clear = () => {
    photo = null;
    input.value = '';
    preview.hidden = true;
    if (img.src) URL.revokeObjectURL(img.src);
    img.removeAttribute('src');
  };
  input.addEventListener('change', async () => {
    setError(name);
    const file = input.files?.[0];
    if (!file) return clear();
    if (!PHOTO.types.includes(file.type)) {
      clear();
      return setError(name, 'Please pick a JPG, PNG, WebP or GIF image.');
    }
    if (file.size > PHOTO.maxPick) {
      clear();
      return setError(name, `That photo is ${(file.size / 1048576).toFixed(1)} MB. Please pick one under 5 MB.`);
    }
    const ready = await shrink(file);
    if (ready.size > PHOTO.maxUpload) {
      clear();
      return setError(name, 'That photo is too big for us to send. Please try a smaller one.');
    }
    photo = ready;
    if (img.src) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(ready);
    preview.hidden = false;
  });
  /** @type {HTMLButtonElement} */ (preview.querySelector('[data-remove-photo]')).addEventListener('click', () => {
    clear();
    input.focus();
  });
}

/** @param {File} file @returns {Promise<Blob>} */
async function shrink(file) {
  if (file.size <= PHOTO.shrinkOver) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO.maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (blob && blob.size < file.size) return blob;
  } catch {
    // Can't decode it here; send the original and let the server decide.
  }
  return file;
}

/** Reads the answers out of the form, in the shape validate() expects. */
function answers() {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const f of config.fields) {
    const field = fieldEl(f.name);
    if (f.type === 'choices') {
      data[f.name] = [...field.querySelectorAll('input:checked')].map(
        (el) => /** @type {HTMLInputElement} */ (el).value,
      );
    } else if (f.type === 'links') {
      data[f.name] = [...field.querySelectorAll('.link-row')].map((row) => ({
        platform: /** @type {HTMLSelectElement} */ (row.querySelector('select')).value,
        url: /** @type {HTMLInputElement} */ (row.querySelector('input')).value,
      }));
    } else if (f.type === 'consent') {
      data[f.name] = /** @type {HTMLInputElement} */ (field.querySelector('input')).checked;
    } else if (f.type !== 'photo') {
      data[f.name] = /** @type {HTMLInputElement} */ (field.querySelector('input, textarea, select')).value;
    }
  }
  return data;
}

/** @param {Record<string, string>} errors */
function showErrors(errors) {
  let first = null;
  for (const f of config.fields) {
    // A photo's own error (set when it was picked) stays unless the server sends a new one.
    if (f.type !== 'photo' || errors[f.name]) setError(f.name, errors[f.name]);
    if (errors[f.name] && !first) first = fieldEl(f.name);
  }
  if (first) {
    // A drop-down's combobox comes before its hidden select, so it's the one focused.
    /** @type {HTMLElement} */ (first.querySelector('input, textarea, [role="combobox"]'))?.focus();
    formError.textContent = 'A few things need fixing. They’re marked in red.';
    formError.hidden = false;
  }
}

// Clear a field's error as soon as it's edited.
formEl.addEventListener('input', (e) => {
  const field = /** @type {HTMLElement} */ (e.target).closest('[data-field]');
  if (field && field.classList.contains('bad') && !field.classList.contains('photo')) {
    setError(/** @type {string} */ (/** @type {HTMLElement} */ (field).dataset.field));
  }
});

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;
  const data = answers();
  const { errors } = validate(config, data);
  if (Object.keys(errors).length) return showErrors(errors);

  const body = new FormData();
  body.set('kind', config.kind);
  body.set('data', JSON.stringify(data));
  body.set('nickname', /** @type {HTMLInputElement} */ (formEl.elements.namedItem('nickname')).value);
  if (photo) body.set('photo', photo, 'photo');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/apply', { method: 'POST', body });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) return thank(data);
    if (json.errors) showErrors(json.errors);
    formError.textContent = json.message ?? 'Something went wrong on our side. Please try again in a minute.';
    formError.hidden = false;
  } catch {
    formError.textContent = 'We couldn’t reach the server. Check your connection and try again.';
    formError.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send my application →';
  }
});

/** @param {Record<string, unknown>} data */
function thank(data) {
  const thanks = /** @type {HTMLElement} */ (document.getElementById('thanks'));
  const first = String(data[config.thanksField] ?? '')
    .trim()
    .split(/\s+/)[0];
  /** @type {HTMLElement} */ (document.getElementById('thanksName')).textContent = first ? `, ${first}` : '';
  /** @type {HTMLElement} */ (document.getElementById('thanksEmail')).textContent = String(
    data[config.emailField] ?? '',
  ).trim();
  formEl.hidden = true;
  /** @type {HTMLElement} */ (document.querySelector('.intro .other'))?.setAttribute('hidden', '');
  thanks.hidden = false;
  thanks.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
  thanks.focus({ preventScroll: true });
}
