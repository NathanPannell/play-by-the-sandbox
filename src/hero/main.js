// Mounts the hero scene into #heroScene: renders the 3D scene into a target,
// redraws it with the crayon pass, and keeps the loop cheap. It pauses when the
// tab is hidden or the hero is scrolled away, draws one still frame for
// prefers-reduced-motion, and leaves the poster image in place when WebGL is
// unavailable. The root's data-state says which: poster (not started yet),
// running, paused, static or fallback.
import {
  CanvasTexture,
  DepthTexture,
  NearestFilter,
  SRGBColorSpace,
  UnsignedIntType,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import { createCrayonPass } from './crayon.js';
import { BLUE, GREEN, INK, PAPER, PURPLE, RED, YELLOW } from './palette.js';
import { pickQuality } from './quality.js';
import { buildScene } from './scene.js';

/** The moment drawn for reduced motion and the poster: limo at the carpet, flashes going off. */
const STILL_T = 11.2;
/** Where the running animation starts, with a limo already rolling in. */
const START_T = 4;

const root = document.getElementById('heroScene');
if (root) start(root);

/** @param {HTMLElement} root */
function start(root) {
  /** @param {string} state */
  const setState = (state) => (root.dataset.state = state);

  if (!supportsWebGL2()) return setState('fallback');
  /** @type {WebGLRenderer} */
  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: false });
  } catch {
    return setState('fallback');
  }

  const quality = pickQuality({
    width: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  });
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

  const ads = adTexture(() => {
    // Redraw a held frame with the slides; the first paint happens during setup, before the scene exists.
    if (frames && !lost && mode !== 'running') draw(mode === 'static' ? STILL_T : t);
  });
  const world = buildScene(quality, { adTexture: ads });
  const target = new WebGLRenderTarget(1, 1, {
    depthTexture: new DepthTexture(1, 1, UnsignedIntType),
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  });
  const crayon = createCrayonPass({
    color: target.texture,
    depth: /** @type {DepthTexture} */ (target.depthTexture),
    near: world.camera.near,
    far: world.camera.far,
  });

  /** @param {number} t */
  function draw(t) {
    world.update(t);
    crayon.setBoil(t);
    renderer.setRenderTarget(target);
    renderer.render(world.scene, world.camera);
    renderer.setRenderTarget(null);
    renderer.render(crayon.scene, crayon.camera);
    canvas.dataset.frames = String(++frames);
    root.classList.add('ready');
  }

  function resize() {
    const w = Math.max(1, root.clientWidth);
    const h = Math.max(1, root.clientHeight);
    renderer.setSize(w, h, false);
    const px = renderer.getPixelRatio();
    target.setSize(Math.round(w * px), Math.round(h * px));
    crayon.setSize(Math.round(w * px), Math.round(h * px), px);
    world.setAspect(w / h);
    const aspect = w / h;
    world.setShift(Math.min(0.2, Math.max(0, (aspect - 1.1) * 0.26)), aspect < 0.8 ? 0.17 : 0);
    if (mode === 'static' || mode === 'paused') draw(mode === 'static' ? STILL_T : t);
  }

  /** @param {number} now */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    t += dt;
    // Phones draw every other frame (about 30 fps).
    if (quality.frameSkip && tick++ % (quality.frameSkip + 1)) return;
    draw(t);
  }

  function schedule() {
    if (lost) return;
    const want = reduced.matches ? 'static' : !document.hidden && onScreen ? 'running' : 'paused';
    if (want === mode && (want !== 'running' || raf)) return setState(mode);
    cancelAnimationFrame(raf);
    raf = 0;
    mode = want;
    if (mode === 'running') {
      last = 0;
      raf = requestAnimationFrame(loop);
    } else if (mode === 'static') {
      draw(STILL_T);
    }
    setState(mode);
  }

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
    setState('fallback');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    resize();
    schedule();
  });

  resize();
  schedule();
}

function supportsWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // Hand the probe's context slot straight back.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/**
 * The projector's slides, drawn once into a 2x2 atlas: the event name, the
 * date, the numbers and the Sandbox sun. Redrawn when the fonts arrive.
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

  const sun = new Image();
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

    panel(3, PURPLE);
    if (sun.complete && sun.naturalWidth) ctx.drawImage(sun, W / 2 - 120, 24, 240, 240);
    toon('come play!', W / 2, 276, 52, GREEN);
    ctx.restore();

    texture.needsUpdate = true;
    onReady();
  }

  paint();
  sun.onload = paint;
  sun.src = '/logo.svg';
  document.fonts?.load('60px Chewy').then(paint, () => {});
  return texture;
}
