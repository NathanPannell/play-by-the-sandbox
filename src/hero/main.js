// Mounts the hero scene into #heroScene: renders the 3D scene, coloured in
// crayon on its own materials (crayon.js), straight to the canvas, and keeps
// the loop cheap. It pauses when the
// tab is hidden or the hero is scrolled away, draws one still frame for
// prefers-reduced-motion, and leaves the poster image in place when WebGL is
// unavailable. The root's data-state says which: poster (not started yet),
// running, paused, static or fallback.
import { CanvasTexture, SRGBColorSpace, WebGLRenderer } from 'three';
import { createCrayon } from './crayon.js';
import { BLUE, INK, PAPER, RED, YELLOW } from './palette.js';
import { adaptScale, isSoftwareRenderer, pickQuality } from './quality.js';
import { STILL_T, buildScene } from './scene.js';

/** Where the running animation starts: a few seconds before the view turns to face the gallery. */
const START_T = STILL_T - 6;

const root = document.getElementById('heroScene');
if (root) start(root);

/** @param {HTMLElement} root */
function start(root) {
  /** @param {string} state */
  const setState = (state) => (root.dataset.state = state);

  const gpu = probeGPU();
  if (gpu === null) return setState('fallback');

  const params = new URLSearchParams(window.location.search);
  const qa = params.has('hero-debug');
  // QA only: ?hero-debug&hero-tier=full|lite|software forces a quality tier.
  const tier = qa ? params.get('hero-tier') : null;
  const quality = pickQuality({
    width: tier === 'full' ? 1440 : tier === 'lite' ? 390 : window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
    coarsePointer: tier === 'full' ? false : window.matchMedia('(pointer: coarse)').matches,
    software: tier ? tier === 'software' : isSoftwareRenderer(gpu),
  });
  /** @type {WebGLRenderer} */
  let renderer;
  try {
    // Straight to the canvas, so the canvas's own multisampling smooths the
    // thin things (ropes, poles, confetti, outlines) as the camera turns.
    renderer = new WebGLRenderer({ antialias: quality.msaa > 0 });
  } catch {
    return setState('fallback');
  }
  const canvas = renderer.domElement;
  canvas.className = 'hero-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.frames = '0';
  renderer.setPixelRatio(quality.dpr);
  root.append(canvas);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** @type {'running' | 'paused' | 'static'} */
  let mode = reduced.matches ? 'static' : 'paused';
  let onScreen = true;
  let t = START_T;
  let last = 0;
  let raf = 0;
  let tick = 0;
  let frames = 0;
  let lost = false;
  let debug = false;
  // The visitor's own choice from the pause/play control (WCAG 2.2.2).
  /** @type {'pause' | 'play' | null} */
  let choice = null;
  // Adaptive quality: the render scale, and frame timing for the current window.
  let scale = 1;
  let calm = 0;
  let windowStart = 0;
  let windowFrames = 0;
  let lastDrawn = 0;
  let fullScaleInterval = 0;
  let adapting = true;

  const ads = adTexture(() => {
    // Redraw a held frame with the slides; the first paint happens during setup, before the scene exists.
    if (frames && !lost && mode !== 'running') draw(mode === 'static' ? STILL_T : t);
  });
  const world = buildScene(quality, { adTexture: ads });
  // Crayon on the models: strokes in each material, ink outlines on the solids.
  const crayon = createCrayon({
    lite: quality.lite,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  crayon.apply(world.scene);

  /** @param {number} t @param {number} [cameraT] */
  function draw(t, cameraT = t) {
    world.update(t, cameraT);
    crayon.setBoil(t);
    renderer.render(world.scene, world.camera);
    canvas.dataset.frames = String(++frames);
    root.classList.add('ready');
    placeCallout();
  }

  // A speech bubble riding on the marquee, hidden when the sign is out of view.
  const callout = document.getElementById('heroCallout');
  const anchor = world.anchors.marquee.clone();
  let calloutAt = '';
  let calloutWidth = 0;
  document.fonts?.ready.then(() => (calloutWidth = 0));
  function placeCallout() {
    if (!callout) return;
    anchor.copy(world.anchors.marquee).project(world.camera);
    const visible = anchor.z < 1 && anchor.x > -0.85 && anchor.x < 0.8 && anchor.y < 0.75 && anchor.y > -0.55;
    if (!visible) {
      if (!callout.hidden) callout.hidden = true;
      calloutAt = '';
      return;
    }
    if (callout.hidden) callout.hidden = false;
    // Measured once: reading layout every frame after moving it would force a reflow each time.
    if (!calloutWidth) calloutWidth = callout.offsetWidth;
    const w = sizes.w;
    // Hang below and to the right of the corner, the tail pointing back up at it.
    const x = Math.min(((anchor.x + 1) / 2) * w - 26, w - calloutWidth - 10);
    const y = ((1 - anchor.y) / 2) * sizes.h + 16;
    const at = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (at !== calloutAt) callout.style.transform = calloutAt = at;
  }

  let sized = '';
  /** The scene's size in CSS pixels, read on resize rather than every frame. */
  const sizes = { w: 1, h: 1 };
  function resize() {
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    sizes.w = w;
    sizes.h = h;
    calloutWidth = 0;
    // The scene is sized to the large viewport, so a phone's address bar
    // doesn't resize it; and nothing is re-allocated unless something changed.
    const key = `${w}x${h}@${renderer.getPixelRatio()}`;
    if (key === sized) return;
    sized = key;
    renderer.setSize(w, h, false);
    const px = renderer.getPixelRatio();
    crayon.setSize(Math.round(w * px), Math.round(h * px), px);
    world.setAspect(w / h);
    const aspect = w / h;
    // Portrait: lift the view a touch over the call to action at the bottom.
    world.setShift(0, aspect < 0.8 ? 0.04 : 0);
    if (mode === 'static' || mode === 'paused') draw(mode === 'static' ? STILL_T : t);
  }

  /** @param {number} now */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    t += dt;
    // Phones draw every other frame (about 30 fps), software renderers every third.
    if (quality.frameSkip && tick++ % (quality.frameSkip + 1)) return;
    draw(t);
    adapt(now);
  }

  /** @param {number} now */
  function adapt(now) {
    if (!lastDrawn) {
      lastDrawn = windowStart = now;
      windowFrames = 0;
      return;
    }
    lastDrawn = now;
    windowFrames++;
    if (now - windowStart < 2000) return;
    const interval = (now - windowStart) / windowFrames;
    windowStart = now;
    windowFrames = 0;
    if (!adapting) return;
    if (scale === 1) fullScaleInterval = interval;
    const min = Math.max(0.55, 0.5 / quality.dpr);
    if (scale <= min && fullScaleInterval && interval > fullScaleInterval * 0.9) {
      // The floor didn't help, so frames are held back by the display (a
      // 30 Hz cap in Low Power Mode or Energy Saver), not by the GPU.
      adapting = false;
      scale = 1;
      root.dataset.scale = '1';
      renderer.setPixelRatio(quality.dpr);
      resize();
      return;
    }
    const next = adaptScale({
      scale,
      interval,
      budget: (1000 / 60) * (quality.frameSkip + 1),
      calm,
      min,
    });
    calm = next.calm;
    if (next.scale !== scale) {
      scale = next.scale;
      root.dataset.scale = String(scale);
      renderer.setPixelRatio(quality.dpr * scale);
      resize();
    }
  }

  function schedule() {
    if (lost || debug) return;
    const still = choice === 'pause' || (reduced.matches && choice !== 'play');
    const want = still
      ? choice === 'pause'
        ? 'paused'
        : 'static'
      : !document.hidden && onScreen
        ? 'running'
        : 'paused';
    showChoice(still);
    if (want === mode && (want !== 'running' || raf)) return setState(mode);
    cancelAnimationFrame(raf);
    raf = 0;
    mode = want;
    if (mode === 'running') {
      last = 0;
      lastDrawn = 0;
      raf = requestAnimationFrame(loop);
    } else if (mode === 'static') {
      draw(STILL_T);
    }
    setState(mode);
  }

  // The pause/play control: the motion runs forever, so visitors can stop it.
  const toggle = document.getElementById('heroPause');
  /** @param {boolean} still */
  function showChoice(still) {
    if (!toggle) return;
    toggle.setAttribute('aria-label', still ? 'Play the scene' : 'Pause the scene');
    const label = toggle.querySelector('.hud-pause-label');
    if (label) label.textContent = still ? 'Play' : 'Pause';
    root.dataset.choice = choice ?? '';
  }
  toggle?.addEventListener('click', () => {
    const still = choice === 'pause' || (reduced.matches && choice !== 'play');
    choice = still ? 'play' : 'pause';
    schedule();
  });

  new ResizeObserver(resize).observe(root);
  new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    schedule();
  }).observe(root);
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', schedule);
  // Show the poster while the GPU context is gone; three.js restores it, then we pick up again.
  canvas.addEventListener('webglcontextlost', () => {
    lost = true;
    cancelAnimationFrame(raf);
    raf = 0;
    mode = 'paused';
    root.classList.remove('ready');
    if (callout) callout.hidden = true;
    setState('fallback');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    sized = '';
    resize();
    schedule();
  });

  resize();
  schedule();

  // Graphics QA (tools/flicker.mjs, e2e/hero.spec.mjs): with ?hero-debug the
  // page exposes a way to stop the loop and draw any moment exactly.
  if (qa) {
    /** @type {any} */ (window).__hero = {
      /** @param {number} at seconds @param {number} [cameraAt] hold the camera at this time instead */
      draw(at, cameraAt = at) {
        debug = true;
        cancelAnimationFrame(raf);
        raf = 0;
        // Held, so a resize redraws this moment instead of leaving the canvas blank.
        mode = 'paused';
        t = at;
        draw(at, cameraAt);
        return canvas;
      },
      world,
      crayon,
    };
  }
}

/**
 * Whether WebGL2 works, and which GPU draws it: the unmasked renderer string,
 * or null without WebGL2. A throwaway context, so the real renderer can be
 * made with the right antialiasing for that GPU's quality tier.
 */
function probeGPU() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    // Hand the probe's context slot straight back.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return null;
  }
}

/**
 * The projector's slides, drawn once into a 2x2 atlas: the event name, the
 * date, the numbers and the wordmark. Redrawn when the fonts arrive.
 * @param {() => void} onReady
 */
function adTexture(onReady) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;
  const W = 512;
  const H = 320;

  /** @param {number} cell @param {string} bg */
  const panel = (cell, bg) => {
    const x = (cell % 2) * W;
    const y = (1 - Math.floor(cell / 2)) * H;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 14;
    ctx.strokeStyle = INK;
    ctx.strokeRect(7, 7, W - 14, H - 14);
    return ctx;
  };
  /** @param {string} text @param {number} x @param {number} y @param {number} size @param {string} fill */
  const toon = (text, x, y, size, fill) => {
    ctx.font = `${size}px Chewy, Gaegu, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size / 6;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };

  const mark = new Image();
  function paint() {
    if (!ctx) return;
    panel(0, YELLOW);
    toon('PLAY BY THE', W / 2, 92, 62, PAPER);
    toon('SANDBOX!', W / 2, 200, 118, RED);
    ctx.restore();

    panel(1, BLUE);
    toon('JAN 2027', W / 2, 120, 104, YELLOW);
    toon('Vancouver Art Gallery', W / 2, 228, 44, PAPER);
    ctx.restore();

    panel(2, RED);
    toon('16 brands', W / 2, 92, 74, PAPER);
    toon('16 directors', W / 2, 168, 62, YELLOW);
    toon('real ads in 3 days', W / 2, 244, 46, PAPER);
    ctx.restore();

    panel(3, PAPER);
    if (mark.complete && mark.naturalWidth) ctx.drawImage(mark, W / 2 - 215, 56, 430, 98);
    toon('come play!', W / 2, 236, 64, RED);
    ctx.restore();

    texture.needsUpdate = true;
    onReady();
  }

  paint();
  mark.onload = paint;
  mark.src = '/wordmark.svg';
  document.fonts?.load('60px Chewy').then(paint, () => {});
  return texture;
}
