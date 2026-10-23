// Pastel drop-downs in place of the native <select>s on the apply and review
// pages. A native select's open list is drawn by the operating system: the
// glove cursor can't appear over it and its highlight ignores the palette.
//
// Each select becomes a select-only combobox (WAI-ARIA APG): a focusable
// role="combobox" that opens a role="listbox" of role="option"s, with the
// keyboard of a native select (arrows, Home/End, Enter/Space, Esc, Tab,
// Alt+Up/Down and type-ahead). The select itself stays in the form, hidden,
// holding the value: forms submit it, scripts read select.value, and every
// change fires the usual input and change events on it. Its aria-invalid and
// aria-describedby (error messages, hints) are mirrored onto the combobox.

let uid = 0;

/** Enhances every native select under root that isn't enhanced yet. @param {ParentNode} [root] */
export function enhanceSelects(root = document) {
  for (const select of root.querySelectorAll('select:not([data-listbox])')) {
    enhance(/** @type {HTMLSelectElement} */ (select));
  }
}

/** @param {HTMLSelectElement} select */
export function enhance(select) {
  const id = `lb${++uid}`;
  select.dataset.listbox = id;

  const wrap = document.createElement('div');
  wrap.className = 'lb';
  const box = document.createElement('div');
  box.className = 'lb-box';
  box.id = `${id}-box`;
  box.tabIndex = select.disabled ? -1 : 0;
  box.setAttribute('role', 'combobox');
  box.setAttribute('aria-haspopup', 'listbox');
  box.setAttribute('aria-expanded', 'false');
  box.setAttribute('aria-controls', `${id}-list`);
  if (select.required) box.setAttribute('aria-required', 'true');
  const value = document.createElement('span');
  value.className = 'lb-value';
  box.append(value);

  const list = document.createElement('ul');
  list.className = 'lb-list';
  list.id = `${id}-list`;
  list.setAttribute('role', 'listbox');
  list.tabIndex = -1;
  list.hidden = true;

  // The select's own label names both the combobox and its list.
  const label = select.id ? document.querySelector(`label[for="${CSS.escape(select.id)}"]`) : null;
  if (label) {
    if (!label.id) label.id = `${id}-label`;
    box.setAttribute('aria-labelledby', `${label.id} ${box.id}`);
    list.setAttribute('aria-labelledby', label.id);
    label.addEventListener('click', (e) => {
      e.preventDefault();
      box.focus();
    });
  } else {
    const name = select.getAttribute('aria-label') ?? '';
    box.setAttribute('aria-label', name);
    list.setAttribute('aria-label', name);
  }

  /** @type {HTMLLIElement[]} */
  const items = [...select.options].map((opt, i) => {
    const li = document.createElement('li');
    li.id = `${id}-o${i}`;
    li.setAttribute('role', 'option');
    li.textContent = opt.textContent;
    li.dataset.index = String(i);
    list.append(li);
    return li;
  });

  wrap.append(box, list);
  select.before(wrap);
  select.hidden = true;
  select.tabIndex = -1;

  let active = -1;
  let typed = '';
  let typedAt = 0;

  // Keep the combobox in step with the select's state.
  const mirror = () => {
    for (const attr of ['aria-invalid', 'aria-describedby']) {
      const v = select.getAttribute(attr);
      if (v === null) box.removeAttribute(attr);
      else box.setAttribute(attr, v);
    }
  };
  const show = () => {
    const i = select.selectedIndex;
    value.textContent = i >= 0 ? (select.options[i].textContent ?? '') : '';
    box.classList.toggle('lb-empty', i < 0 || select.options[i].value === '');
    items.forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
  };
  new MutationObserver(mirror).observe(select, {
    attributes: true,
    attributeFilter: ['aria-invalid', 'aria-describedby'],
  });
  select.addEventListener('change', show);
  select.form?.addEventListener('reset', () => setTimeout(show));
  mirror();
  show();

  const isOpen = () => box.getAttribute('aria-expanded') === 'true';
  /** @param {number} i */
  const highlight = (i) => {
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((li, j) => li.classList.toggle('lb-active', j === active));
    box.setAttribute('aria-activedescendant', items[active].id);
    const li = items[active];
    if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
  };
  /** @param {number} [i] */
  const open = (i = select.selectedIndex) => {
    if (select.disabled) return;
    list.hidden = false;
    box.setAttribute('aria-expanded', 'true');
    wrap.classList.add('lb-open');
    highlight(i < 0 ? 0 : i);
  };
  const close = () => {
    list.hidden = true;
    box.setAttribute('aria-expanded', 'false');
    box.removeAttribute('aria-activedescendant');
    wrap.classList.remove('lb-open');
    items.forEach((li) => li.classList.remove('lb-active'));
  };
  /** @param {number} i */
  const choose = (i) => {
    if (i !== select.selectedIndex) {
      select.selectedIndex = i;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    show();
  };
  /** Type-ahead: the next option whose text starts with what was typed. @param {string} ch */
  const seek = (ch) => {
    const now = Date.now();
    typed = now - typedAt > 600 ? ch : typed + ch;
    typedAt = now;
    const from = isOpen() ? active : select.selectedIndex;
    const same = typed.split('').every((c) => c === typed[0]);
    const needle = same ? typed[0] : typed;
    const start = same || typed.length === 1 ? from + 1 : from;
    for (let k = 0; k < items.length; k++) {
      const j = (start + k + items.length) % items.length;
      if ((items[j].textContent ?? '').trim().toLowerCase().startsWith(needle)) return j;
    }
    return -1;
  };

  box.addEventListener('click', () => (isOpen() ? close() : open()));
  box.addEventListener('keydown', (e) => {
    const { key } = e;
    if (e.ctrlKey || e.metaKey) return;
    if (!isOpen()) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        e.preventDefault();
        open();
      } else if (key === 'Home' || key === 'End') {
        e.preventDefault();
        open(key === 'Home' ? 0 : items.length - 1);
      } else if (key.length === 1 && !e.altKey) {
        const j = seek(key.toLowerCase());
        if (j >= 0) open(j);
      }
      return;
    }
    if (key === 'ArrowDown' && !e.altKey) highlight(active + 1);
    else if (key === 'ArrowUp' && e.altKey) {
      choose(active);
      close();
    } else if (key === 'ArrowUp') highlight(active - 1);
    else if (key === 'Home') highlight(0);
    else if (key === 'End') highlight(items.length - 1);
    else if (key === 'PageDown') highlight(active + 8);
    else if (key === 'PageUp') highlight(active - 8);
    else if (key === 'Enter' || key === ' ') {
      choose(active);
      close();
    } else if (key === 'Escape') close();
    else if (key === 'Tab') {
      choose(active);
      close();
      return;
    } else if (key.length === 1 && !e.altKey) {
      const j = seek(key.toLowerCase());
      if (j >= 0) highlight(j);
    } else return;
    e.preventDefault();
  });
  box.addEventListener('blur', () => isOpen() && close());

  // Keep focus on the combobox while the list is clicked.
  list.addEventListener('pointerdown', (e) => e.preventDefault());
  list.addEventListener('pointermove', (e) => {
    const li = /** @type {HTMLElement} */ (e.target).closest('[role="option"]');
    if (li) highlight(Number(/** @type {HTMLElement} */ (li).dataset.index));
  });
  list.addEventListener('click', (e) => {
    const li = /** @type {HTMLElement} */ (e.target).closest('[role="option"]');
    if (!li) return;
    choose(Number(/** @type {HTMLElement} */ (li).dataset.index));
    close();
    box.focus();
  });
}
