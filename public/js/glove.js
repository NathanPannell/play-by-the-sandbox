// The cartoon glove cursor: an old rubber-hose, four-finger white glove drawn
// in crayon that follows the mouse with a slight lag and tilt. It waves open
// over the page, points at links, buttons and drop-down options, holds a
// crayon over text fields (its tip is the hotspot; the caret shows where text
// goes) and squashes into a grab on click. It stays on everywhere a page can
// draw: only the root scrollbars and other documents (iframes) get the native
// cursor back. Only for fine pointers; touch and reduced motion keep the
// native cursor. Self-contained, so any page can add it with
// <script src='/js/glove.js' defer></script>.
(function () {
  if (!window.matchMedia || document.querySelector('.glove')) return;
  var fine = window.matchMedia('(pointer: fine)');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The fingertip, in CSS px from the glove's top-left corner (viewBox 64x84 at 40x52.5).
  var HX = 10, HY = 2.5;
  var INTERACTIVE = 'a[href], button, [role="button"], [role="combobox"], [role="option"], label, summary, select, input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"], input[type="file"], input[type="range"], input[type="color"], input[type="image"]';
  var TEXTY = 'input, textarea, [contenteditable=""], [contenteditable="true"]';

  // Each pose is drawn twice: fat ink strokes underneath, white ones on top,
  // so the fingers, thumb and palm merge into one outlined silhouette.
  /** @param {string} shapes @param {string} ink @param {string} white */
  function puff(shapes, ink, white) {
    return '<g stroke="var(--ink, #3a3342)" fill="var(--ink, #3a3342)" stroke-linecap="round" stroke-linejoin="round" stroke-width="' + ink + '">' + shapes + '</g>' +
      '<g stroke="var(--card, #fffdf9)" fill="var(--card, #fffdf9)" stroke-linecap="round" stroke-linejoin="round" stroke-width="' + white + '">' + shapes + '</g>';
  }
  /** @param {string} d */
  function line(d) { return '<path d="' + d + '"/>'; }
  var STITCH = '<path d="M31 45 L30.5 54 M36 44 L36 54.5 M41 45 L41.5 54" fill="none" stroke="var(--ink, #3a3342)" stroke-width="2.2" stroke-linecap="round"/>';
  var CUFF = '<path d="M21 61 Q36 56 51 61 L55 74 Q36 82 17 74 Z" fill="var(--card, #fffdf9)" stroke="var(--ink, #3a3342)" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M20 67 Q36 62 52 67" fill="none" stroke="var(--ink, #3a3342)" stroke-width="2" stroke-linecap="round"/>';
  var PALM = '<circle cx="36" cy="47" r="15"/><path d="M28 58 L44 58"/>';
  var THUMB_FRONT = puff(line('M23 52 Q28 47 34 47'), '15', '9');
  var THUMB_TUCK = puff(line('M24 51 Q30 47 37 49'), '14', '8');

  var OPEN = puff(PALM + line('M28 38 L17 10') + line('M36 35 L34 6') + line('M43 37 L49 12') + line('M24 51 L10 39'), '16', '10') + STITCH;
  var POINT = puff(PALM + line('M30 40 L17 8') + '<circle cx="40" cy="34" r="6"/><circle cx="46" cy="41" r="6"/>', '16', '10') +
    THUMB_FRONT + '<path d="M41.5 40 L43 43" fill="none" stroke="var(--ink, #3a3342)" stroke-width="2" stroke-linecap="round"/>';
  var KNUCKLES = '<circle cx="24" cy="34" r="6.5"/><circle cx="33" cy="30" r="6.5"/><circle cx="42" cy="32" r="6.5"/>';
  var GRAB = puff(PALM + KNUCKLES, '16', '10') +
    THUMB_TUCK + '<path d="M28.5 35 L29.5 39.5 M37.5 33 L37.5 37.5" fill="none" stroke="var(--ink, #3a3342)" stroke-width="2" stroke-linecap="round"/>';
  // Over text fields: a rose crayon held in the fist, its tip up and left on the hotspot.
  var CRAYON = '<path d="M20.1 10.9 L36 37.4" stroke="var(--ink, #3a3342)" stroke-width="11.5"/>' +
    '<path d="M20.1 10.9 L36 37.4" stroke="var(--rose-deep, #eb9cad)" stroke-width="6.5"/>' +
    '<path d="M15.7 3.6 L25 7.9 L15.2 13.9 Z" fill="var(--rose-ink, #ad4660)" stroke="var(--ink, #3a3342)" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M23.3 23 L29.3 19.4 M26.4 28.1 L32.4 24.5" stroke="var(--ink, #3a3342)" stroke-width="1.8" stroke-linecap="round"/>';
  var WRITE = puff(PALM + KNUCKLES, '16', '10') + CRAYON + THUMB_TUCK;

  var css = '.glove{position:fixed;left:0;top:0;z-index:2147483000;width:40px;height:52.5px;pointer-events:none;opacity:0;transform-origin:' + HX + 'px ' + HY + 'px;will-change:transform;transition:opacity .15s ease}' +
    '.glove.show{opacity:1}' +
    '.glove-in{width:100%;height:100%;transform-origin:' + HX + 'px ' + HY + 'px;transition:transform .22s cubic-bezier(.3,1.8,.5,1)}' +
    '.glove svg{display:block;width:100%;height:100%;overflow:visible;filter:url(#crayonSoft) drop-shadow(2px 3px 0 rgba(58,51,66,.18))}' +
    '.glove g[data-pose]{display:none}' +
    '.glove[data-pose="open"] g[data-pose="open"],.glove[data-pose="point"] g[data-pose="point"],.glove[data-pose="grab"] g[data-pose="grab"],.glove[data-pose="write"] g[data-pose="write"]{display:inline}' +
    '.glove.press .glove-in{transform:scale(1.14,.8);transition-duration:.07s}' +
    // Text fields too: the glove holds a crayon there, so no I-beam on top of it.
    'html.glove-on,html.glove-on *,html.glove-on *::before,html.glove-on *::after{cursor:none !important}' +
    'html.glove-on ::file-selector-button{cursor:none !important}';

  var el = document.createElement('div');
  el.className = 'glove';
  el.setAttribute('aria-hidden', 'true');
  el.dataset.pose = 'open';
  el.innerHTML = '<div class="glove-in"><svg viewBox="0 0 64 84" focusable="false">' +
    '<g data-pose="open">' + OPEN + '</g><g data-pose="point">' + POINT + '</g><g data-pose="grab">' + GRAB + '</g><g data-pose="write">' + WRITE + '</g>' + CUFF + '</svg></div>';
  var style = document.createElement('style');
  style.textContent = css;

  var on = false, shown = false, pressed = false, over = false, typing = false;
  var tx = 0, ty = 0, x = 0, y = 0, tilt = 0, raf = 0;

  function frame() {
    raf = 0;
    // Ease towards the pointer (a slight lag), and lean into the motion.
    x += (tx - x) * 0.5;
    y += (ty - y) * 0.5;
    var lean = Math.max(-16, Math.min(16, (tx - x) * 0.9));
    tilt += (lean - tilt) * 0.3;
    el.style.transform = 'translate3d(' + (x - HX).toFixed(1) + 'px,' + (y - HY).toFixed(1) + 'px,0) rotate(' + tilt.toFixed(2) + 'deg)';
    if (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1 || Math.abs(tilt) > 0.05) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  /** @param {boolean} v */
  function show(v) {
    if (v === shown) return;
    shown = v;
    el.classList.toggle('show', v);
    document.documentElement.classList.toggle('glove-on', v);
  }
  function pose() { el.dataset.pose = pressed ? 'grab' : over ? 'point' : typing ? 'write' : 'open'; }

  /** @param {EventTarget | null} t @param {string} sel */
  function closest(t, sel) {
    return t instanceof Element ? t.closest(sel) : null;
  }

  /** @param {PointerEvent} e */
  function move(e) {
    if (e.pointerType === 'touch') { show(false); return; }
    // The root scrollbars belong to the browser: no page cursor can hide the arrow there.
    var de = document.documentElement;
    if (e.clientX >= de.clientWidth || e.clientY >= de.clientHeight) { show(false); return; }
    tx = e.clientX; ty = e.clientY;
    if (!shown) { x = tx; y = ty; tilt = 0; }
    show(true);
    kick();
  }
  /** @param {PointerEvent} e */
  function hover(e) {
    over = !!closest(e.target, INTERACTIVE);
    typing = !over && !!closest(e.target, TEXTY);
    pose();
  }
  /** @param {PointerEvent} e */
  function down(e) {
    if (e.pointerType === 'touch') return;
    pressed = true; el.classList.add('press'); pose();
  }
  function up() { pressed = false; el.classList.remove('press'); pose(); }
  function away() { show(false); up(); }
  /** @param {MouseEvent} e */
  function leave(e) { if (!e.relatedTarget || e.relatedTarget instanceof HTMLIFrameElement) away(); }

  function enable() {
    on = true;
    document.head.appendChild(style);
    document.body.appendChild(el);
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', hover, { passive: true });
    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointerup', up, { passive: true });
    // A native drag ends in pointercancel, not pointerup.
    document.addEventListener('pointercancel', up, { passive: true });
    document.addEventListener('mouseout', leave, { passive: true });
    window.addEventListener('blur', away);
  }
  function disable() {
    on = false;
    show(false);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerover', hover);
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    document.removeEventListener('mouseout', leave);
    window.removeEventListener('blur', away);
    el.remove();
    style.remove();
  }
  function sync() {
    var want = fine.matches && !still.matches;
    if (want && !on) enable();
    else if (!want && on) disable();
  }
  [fine, still].forEach(function (mq) {
    if (mq.addEventListener) mq.addEventListener('change', sync);
    else mq.addListener(sync);
  });
  sync();
})();
