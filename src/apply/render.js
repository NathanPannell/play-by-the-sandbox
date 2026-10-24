// Renders the apply pages (/apply/creator, /apply/brand) and the team's review
// page (/apply/review) to static HTML at build time, from the configs in
// forms.js. The browser scripts (client.js, review-client.js) add behaviour on
// top. Styles live in public/apply/apply.css, on the site's palette
// (public/styles/tokens.css).
import { PHOTO } from './forms.js';

const SITE = 'https://playbythesandbox.ca';
const FONTS = 'https://fonts.googleapis.com/css2?family=Gochi+Hand&amp;family=Patrick+Hand&amp;display=swap';

// The glove cursor (/js/glove.js) draws itself through the home page's
// #crayonSoft filter. CSS can't reference a filter in another file, so each
// page carries its own copy. Text has no filter.
const CRAYON_FILTERS = `<svg width="0" height="0" style="position: absolute" aria-hidden="true" focusable="false"><defs>
<filter id="crayonSoft" x="-4%" y="-20%" width="108%" height="140%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="1" seed="5" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="1.3" xChannelSelector="R" yChannelSelector="G" result="wob"/><feTurbulence type="fractalNoise" baseFrequency="1.2 0.4" numOctaves="2" seed="21" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.3 1.55" result="mask"/><feComposite in="wob" in2="mask" operator="in"/></filter>
</defs></svg>`;

/** @param {unknown} s */
export function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
}

/**
 * @param {{ title: string, description: string, path: string, index: boolean, bodyAttrs: string, main: string, script: string }} page
 */
function layout(page) {
  const url = SITE + page.path;
  return `<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} · Play by the Sandbox</title>
<meta name="description" content="${esc(page.description)}">
<meta name="robots" content="${page.index ? 'index, follow' : 'noindex, nofollow'}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#fff8ef">
<link rel="icon" type="image/svg+xml" href="/logo.svg">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Play by the Sandbox">
<meta property="og:url" content="${url}">
<meta property="og:title" content="${esc(page.title)} · Play by the Sandbox">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:image" content="https://www.playbythesandbox.ca/api/og?v=3">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/apply/apply.css">
</head>
<body ${page.bodyAttrs}>
${CRAYON_FILTERS}
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<a class="home" href="/"><img src="/wordmark.svg" alt="Sandbox, back to the home page" width="176" height="40"></a>
<a class="chip" href="/">← back to the site</a>
</header>
<main id="main">
${page.main}
</main>
<footer class="foot hand">Play by the Sandbox · Vancouver Art Gallery North Plaza · January 2027</footer>
<script type="module" src="${page.script}"></script>
<script src="/js/glove.js" defer></script>
</body>
</html>
`;
}

/** @param {string} id @param {import('./forms.js').Field} f */
function describedBy(id, f) {
  return f.hint ? `${id}-hint ${id}-err` : `${id}-err`;
}

/** @param {string} id @param {import('./forms.js').Field} f */
function hintFor(id, f) {
  return f.hint ? `<p class="hint" id="${id}-hint">${esc(f.hint)}</p>` : '';
}

/** @param {string} id */
const errorSlot = (id) => `<p class="err" id="${id}-err" hidden></p>`;

/** @param {import('./forms.js').Field} f */
const star = (f) => (f.required ? ' <span class="req" aria-hidden="true">*</span>' : '');

/** @param {string} platform @param {string[]} platforms @param {string} name */
function linkRow(platform, platforms, name) {
  const options = platforms.map((p) => `<option${p === platform ? ' selected' : ''}>${esc(p)}</option>`).join('');
  return `<div class="link-row"><select name="${name}.platform[]" aria-label="Platform">${options}</select><input name="${name}.url[]" type="text" inputmode="url" autocomplete="url" maxlength="300" placeholder="@yourhandle or a link" aria-label="Link or @handle"><button class="x" type="button" data-remove-row aria-label="Remove this link">×</button></div>`;
}

/**
 * @param {import('./forms.js').Field} f
 * @returns {string}
 */
export function renderField(f) {
  const id = `f-${f.name}`;
  const req = f.required ? ' required' : '';
  const aria = `aria-describedby="${describedBy(id, f)}"`;
  const attrs = (/** @type {string} */ extra) =>
    `id="${id}" name="${f.name}"${req}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''}${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ''} ${aria}${extra}`;
  const label = `<label for="${id}">${esc(f.label)}${star(f)}</label>`;
  switch (f.type) {
    case 'textarea': {
      const max = f.max ?? 2000;
      return `<div class="field" data-field="${f.name}">${label}${hintFor(id, f)}<textarea ${attrs(` rows="${f.rows ?? 4}" maxlength="${max}"`)}></textarea><p class="count" aria-hidden="true"><span data-count-for="${id}">0</span> / ${max}</p>${errorSlot(id)}</div>`;
    }
    case 'select': {
      const options = (f.options ?? []).map((o) => `<option>${esc(o)}</option>`).join('');
      return `<div class="field" data-field="${f.name}">${label}${hintFor(id, f)}<select ${attrs('')}><option value="">Choose one…</option>${options}</select>${errorSlot(id)}</div>`;
    }
    case 'choices': {
      const boxes = (f.options ?? [])
        .map(
          (o) =>
            `<label class="pick"><input type="checkbox" name="${f.name}[]" value="${esc(o)}"><span>${esc(o)}</span></label>`,
        )
        .join('');
      return `<fieldset class="field" id="${id}" data-field="${f.name}" ${aria}><legend>${esc(f.label)}${star(f)}</legend>${hintFor(id, f)}<div class="picks">${boxes}</div>${errorSlot(id)}</fieldset>`;
    }
    case 'links': {
      const platforms = f.platforms ?? [];
      const rows = (f.start ?? [platforms[0]]).map((p) => linkRow(p, platforms, f.name)).join('');
      return `<fieldset class="field" id="${id}" data-field="${f.name}" data-max-rows="${f.maxRows ?? 8}" ${aria}><legend>${esc(f.label)}${star(f)}</legend>${hintFor(id, f)}<div class="links">${rows}</div><template>${linkRow(platforms.includes('Website') ? 'Website' : platforms[0], platforms, f.name)}</template><button class="add" type="button" data-add-row>+ add another link</button>${errorSlot(id)}</fieldset>`;
    }
    case 'photo':
      return `<div class="field photo" data-field="${f.name}" data-max-pick="${PHOTO.maxPick}">${label}${hintFor(id, f)}<input type="file" accept="${PHOTO.types.join(',')}" ${attrs('')}><div class="preview" hidden><button class="x" type="button" data-remove-photo>Remove photo</button></div>${errorSlot(id)}</div>`;
    case 'consent':
      return `<div class="field consent" data-field="${f.name}"><label class="pick"><input type="checkbox" ${attrs('')}><span>${esc(f.label)}</span></label>${errorSlot(id)}</div>`;
    default: {
      const max = f.max ?? 200;
      const inputmode = f.type === 'url' ? ' inputmode="url"' : '';
      // url fields are type=text so "instagram.com/you" works without https://.
      const type = f.type === 'email' ? 'email' : 'text';
      return `<div class="field" data-field="${f.name}">${label}${hintFor(id, f)}<input type="${type}"${inputmode} ${attrs(` maxlength="${max}"`)}>${errorSlot(id)}</div>`;
    }
  }
}

/** @param {import('./forms.js').Form} form */
export function renderForm(form) {
  /** @type {{ title?: string, fields: import('./forms.js').Field[] }[]} */
  const groups = [];
  for (const f of form.fields) {
    if (f.section || !groups.length) groups.push({ title: f.section, fields: [] });
    groups[groups.length - 1].fields.push(f);
  }
  let n = 0;
  const sections = groups
    .map((g) => {
      const body = g.fields.map(renderField).join('\n');
      if (!g.title) return `<div class="sec">${body}</div>`;
      n += 1;
      return `<fieldset class="sec"><legend><span class="num">${n}</span>${esc(g.title)}</legend>\n${body}\n</fieldset>`;
    })
    .join('\n');
  return `<form id="applyForm" class="paper" novalidate data-kind="${form.kind}">
<noscript><p class="note">This form needs JavaScript turned on. If you can’t, email us at <a href="mailto:carmelloa.giron@gmail.com">carmelloa.giron@gmail.com</a>.</p></noscript>
<p class="small"><span class="req">*</span> means we need it. Everything else is optional.</p>
${sections}
<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="nickname" tabindex="-1" autocomplete="off"></label></div>
<p class="form-error" id="formError" role="alert" hidden></p>
<div class="send"><button class="btn btn-y" type="submit">Send my application →</button></div>
<p class="small">We only use what you send to review your application and get back to you.</p>
</form>`;
}

const DOODLE = `<svg class="doodle" viewBox="0 0 220 120" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 92 C 60 60, 90 110, 130 80 S 190 50, 205 70" style="stroke: var(--mint-ink)" stroke-width="7"/><path d="M48 30 l8 18 l19 2 l-14 13 l4 19 l-17 -9 l-17 9 l4 -19 l-14 -13 l19 -2 z" style="stroke: var(--ink); fill: var(--butter)" stroke-width="4"/><circle cx="160" cy="34" r="16" style="stroke: var(--ink); fill: var(--rose)" stroke-width="4"/><path d="M110 20 l6 10 M128 14 l-2 12 M100 40 l12 2" style="stroke: var(--rose-ink)" stroke-width="5"/></g></svg>`;

/** @param {import('./forms.js').Form} form */
export function renderApplyPage(form) {
  const main = `<section class="intro">
<p class="ribbon hand">Play by the Sandbox · January 2027</p>
<h1 class="toon"><span>${esc(form.heading[0])}</span> <span class="hl">${esc(form.heading[1])}</span></h1>
<p class="lede">${esc(form.intro)}</p>
<p class="other hand"><a href="${form.other.href}">${esc(form.other.label)} →</a></p>
</section>
${renderForm(form)}
<section id="thanks" class="thanks paper" hidden tabindex="-1">
${DOODLE}
<h2 class="toon">Got it<span id="thanksName"></span>!</h2>
<p class="hand big">Your application is in. The Sandbox team reads every one, and if it’s a fit we’ll email you at <strong id="thanksEmail"></strong>.</p>
<p><a class="btn btn-w" href="/">Back to the sandbox</a></p>
</section>`;
  return layout({
    title: form.title,
    description: form.intro,
    path: form.path,
    index: true,
    bodyAttrs: `class="apply" data-form="${form.kind}"`,
    main,
    script: '/apply/apply.js',
  });
}

export function renderReviewPage() {
  const main = `<section class="intro">
<p class="ribbon hand">Team only</p>
<h1 class="toon"><span class="hl">Applications</span></h1>
</section>
<form id="login" class="paper login">
<div class="field"><label for="secret">Review password</label><input id="secret" type="password" autocomplete="current-password" required aria-describedby="secret-err">
<p class="err" id="secret-err" hidden></p></div>
<div class="send"><button class="btn btn-y" type="submit">Open the pile →</button></div>
</form>
<section id="board" hidden>
<div class="toolbar">
<label for="filterKind">Show</label> <select id="filterKind"><option value="">creators and brands</option><option value="creator">creators</option><option value="brand">brands</option></select>
<label for="filterStatus">Status</label> <select id="filterStatus"><option value="">any</option><option value="new">new</option><option value="shortlisted">shortlisted</option><option value="declined">declined</option></select>
<button class="chip" type="button" id="refresh">Refresh</button>
<button class="chip" type="button" id="signOut">Sign out</button>
</div>
<p id="summary" class="hand big" aria-live="polite"></p>
<ol id="list" class="cards"></ol>
</section>`;
  return layout({
    title: 'Review applications',
    description: 'The Sandbox team’s review page for creator and brand applications.',
    path: '/apply/review',
    index: false,
    bodyAttrs: 'class="apply review"',
    main,
    script: '/apply/review.js',
  });
}
