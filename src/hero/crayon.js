// The crayon pass. The scene renders into a target with a depth texture, then
// this full-screen shader redraws it on paper: hue-preserving posterised colour,
// waxy coverage that skips the paper's grain, hatched strokes that follow the
// luminance gradient near edges and run diagonally elsewhere, cross-hatching in
// the darks, a little colour bleed, glowing light sources with a halo, and
// wobbly ink outlines from a colour Sobel and a depth Laplacian (on inverse
// depth, which is flat across any plane, so the ground doesn't sprout contour
// lines).
//
// The crayon marks are drawn on the surfaces, not on the screen. Each pixel's
// world position comes back from the depth texture, and the hatching (and the
// regions that vary its angle) is laid on the surface it lands on, projected
// from the axis the surface faces most (triplanar). So as the camera turns,
// strokes stay on the gallery, the screens and the props, instead of the
// scene sliding behind a fixed sheet of texture. To keep strokes about the
// same width on screen at any distance, each is drawn at two power-of-two
// scales around the size of a CSS pixel there and cross-faded by distance:
// both scales are fixed to the world, so nothing swims or pops. Only the
// paper's tooth stays fixed to the screen, as paper would.
//
// Nothing changes abruptly from one frame to the next, so it doesn't flicker
// as the camera turns: the posterised steps and the wax coverage are soft
// rather than hard thresholds. The one deliberate jump is the "boil": like
// hand-drawn animation, the strokes and the outline wobble step through
// BOIL_VARIANTS slightly different drawings, BOIL_FPS times a second. A small
// offset each, never a reseed, so it reads as the same drawing redrawn. Under
// reduced motion the page draws one still frame, on one variant.
import { Color, Matrix4, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from 'three';
import { INK, PAPER } from './palette.js';

/** How many times a second the drawing boils to its next variant. */
export const BOIL_FPS = 5;
/** How many slightly different drawings the boil cycles through. */
export const BOIL_VARIANTS = 4;
/** The most the outline wobble moves a line, in CSS pixels. */
export const WOBBLE_PX = 2.2;
/**
 * Each variant's nudge: the strokes' offset (in their own units, about a CSS
 * pixel, so mostly across the strokes) and the outline wobble's offset (in its
 * noise cells).
 */
export const VARIANTS = [
  { strokes: [0, 0], wobble: [0, 0] },
  { strokes: [0.4, 1.25], wobble: [0.55, 0.3] },
  { strokes: [0.9, 0.45], wobble: [0.2, 0.75] },
  { strokes: [0.2, 1.7], wobble: [0.8, 0.5] },
];

/** Which variant the boil shows at a moment. @param {number} seconds */
export function boilStep(seconds) {
  const n = Math.floor(seconds * BOIL_FPS + 1e-6) % BOIL_VARIANTS;
  return n < 0 ? n + BOIL_VARIANTS : n;
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uPx;
uniform float uWobble;
uniform mat4 uInvViewProj;
uniform float uTanHalf;
uniform vec2 uBoilStrokes;
uniform vec2 uBoilWobble;
uniform float uNear;
uniform float uFar;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uHalo;
varying vec2 vUv;

// Integer hash (PCG) of a lattice point. A float hash like
// fract(p * 234.34) runs out of precision at the coordinates the grain uses
// (thousands of cells), and its output falls into a repeating lattice that
// shows as tiling seams, worst at high device pixel ratios.
uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float hash(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p)) + 65536);
  return float(pcg(q.x + pcg(q.y))) * (1.0 / 4294967295.0);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec3 colAt(vec2 uv) { return toSRGB(texture2D(tColor, uv).rgb); }
// Light sources (the marquee) write alpha 0; everything else writes 1.
float glowAt(vec2 uv) { return 1.0 - texture2D(tColor, uv).a; }
// 1 / view distance: affine in screen space across a plane.
float invDepthAt(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  return (uFar - z * (uFar - uNear)) / (uNear * uFar);
}
// Where a pixel is in the world, from its depth.
vec3 worldAt(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  vec4 p = uInvViewProj * vec4(uv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// The finest detail a pattern may have, in noise cells per CSS pixel: under
// half a cell per device pixel. Finer value noise aliases against the pixel
// grid into a moire that reads as tiling seams, at some pixel ratios and not
// others.
float band(float cellsPerCss) { return min(cellsPerCss, 0.45 * uPx); }
// Grain lives in a rotated, offset copy of the plane, so its lattice never
// lines up with the pixel grid either.
vec2 tilt(vec2 p, float a) { return rot(a) * p + vec2(37.1, 91.7) * a; }
// Strokes in their own units: q is a point on a surface, in units of about a
// CSS pixel there (one of the two scales, so between one and two CSS pixels):
// the frequencies sit a little under the band limit.
float strokes(vec2 q, float angle, float offset) {
  vec2 r = rot(angle) * q + uBoilStrokes;
  return 0.62 * noise(vec2(r.x * 0.03, r.y * 0.6 * band(0.75)) + offset) + 0.38 * noise(vec2(r.x * 0.07, r.y * 0.6 * band(1.7)) + offset * 1.7);
}
// The two crayon marks on one plane at one scale: the main strokes (following
// the screen's luminance gradient where there is one, otherwise diagonal) and,
// only where it shows, the cross-hatch for the darks.
vec2 marks(vec2 q, float diagonal, float along, float follow, bool hatch) {
  float s = strokes(q, diagonal, 0.0);
  if (follow > 0.001) s = mix(s, strokes(q, along, 0.0), follow);
  return vec2(s, hatch ? strokes(q, diagonal + 1.25, 3.0) : 0.5);
}
// Both scales on one plane, cross-faded, with the contrast the blend loses put back.
// p is in world units (metres). Each plane has its own hatch angle: an angle
// that varied across the surface would turn the strokes about the world's
// origin, far away in stroke units, and swirl them into rings.
vec2 marksOn(vec2 p, float diagonal, float scale0, float fade, float along, float follow, bool hatch) {
  #ifdef LITE
  // Phones: a shorter cross-fade, so most pixels draw only one scale.
  float w = smoothstep(0.3, 0.7, fade);
  #else
  float w = fade;
  #endif
  vec2 m = vec2(0.0);
  if (w < 0.999) m += (1.0 - w) * marks(p / scale0, diagonal, along, follow, hatch);
  // No offset between scales: a scale must look the same whether it is the finer or the coarser of the pair.
  if (w > 0.001) m += w * marks(p / (scale0 * 2.0), diagonal, along, follow, hatch);
  return 0.5 + (m - 0.5) / sqrt((1.0 - w) * (1.0 - w) + w * w);
}
// A staircase with soft risers: posterised, but with no hard step to flip.
float softSteps(float x, float n) {
  float q = x * n;
  return (floor(q) + smoothstep(0.3, 0.7, fract(q))) / n;
}

void main() {
  vec2 css = gl_FragCoord.xy / uPx;
  vec2 texel = 1.0 / uRes;

  // A hand that never quite follows the line, a little different each time the drawing boils.
  vec2 wob = vec2(noise(css * 0.03 + uBoilWobble), noise(css * 0.03 - uBoilWobble + 41.0)) - 0.5;
  vec2 uv = vUv + wob * 2.0 * uWobble * uPx * texel;

  // Colour, bleeding a little past its edges.
  vec3 base = colAt(uv);
  vec2 bleed = (vec2(noise(css * 0.09 + 3.0), noise(css * 0.09 + 17.0)) - 0.5) * 5.0 * uPx * texel;
  base = mix(base, colAt(uv + bleed), 0.45);

  // Edges from colour and depth, with a crayon-width kernel.
  vec2 k = 1.6 * uPx * texel;
  vec3 c00 = colAt(uv + k * vec2(-1.0, -1.0)); vec3 c10 = colAt(uv + k * vec2(0.0, -1.0)); vec3 c20 = colAt(uv + k * vec2(1.0, -1.0));
  vec3 c01 = colAt(uv + k * vec2(-1.0, 0.0));                                              vec3 c21 = colAt(uv + k * vec2(1.0, 0.0));
  vec3 c02 = colAt(uv + k * vec2(-1.0, 1.0));  vec3 c12 = colAt(uv + k * vec2(0.0, 1.0));  vec3 c22 = colAt(uv + k * vec2(1.0, 1.0));
  vec3 gxc = (c20 + 2.0 * c21 + c22) - (c00 + 2.0 * c01 + c02);
  vec3 gyc = (c02 + 2.0 * c12 + c22) - (c00 + 2.0 * c10 + c20);
  float colEdge = length(vec2(length(gxc), length(gyc)));
  float dc = invDepthAt(uv);
  float lap = abs(invDepthAt(uv + k * vec2(-1.0, 0.0)) + invDepthAt(uv + k * vec2(1.0, 0.0)) + invDepthAt(uv + k * vec2(0.0, -1.0)) + invDepthAt(uv + k * vec2(0.0, 1.0)) - 4.0 * dc);
  #ifdef LITE
  float depthEdge = lap / dc;
  #else
  float lapX = abs(invDepthAt(uv + k * vec2(-1.0, -1.0)) + invDepthAt(uv + k * vec2(1.0, 1.0)) + invDepthAt(uv + k * vec2(1.0, -1.0)) + invDepthAt(uv + k * vec2(-1.0, 1.0)) - 4.0 * dc);
  float depthEdge = max(lap, lapX * 0.5) / dc;
  #endif
  float edge = max(smoothstep(0.32, 0.75, colEdge), smoothstep(0.08, 0.22, depthEdge));

  // Posterise luminance, keep the hue, push the saturation a bit.
  float L = luma(base);
  // Soften the steps a little, so smooth gradients don't turn into contour maps.
  float Lq = mix(softSteps(L + 0.1, 5.0) - 0.1, L, 0.35);
  vec3 wax = clamp(base * (Lq + 0.06) / (L + 0.06), 0.0, 1.0);
  wax = clamp(mix(vec3(luma(wax)), wax, 1.3), 0.0, 1.0);

  // Strokes follow edges where there is a gradient, otherwise run diagonally.
  // The two patterns are blended, not the angle, so a moving edge doesn't
  // spin the strokes around it.
  vec2 g = vec2(luma(gxc), luma(gyc));
  float along = atan(g.y, g.x) + 1.5708;
  float follow = smoothstep(0.12, 0.4, length(g));

  // ...drawn on the surfaces. The surface's normal comes from how its world
  // position changes across the screen; it picks the plane(s) to project on.
  vec3 wp = worldAt(uv);
  vec3 dx = dFdx(wp);
  vec3 dy = dFdy(wp);
  vec3 n = abs(normalize(cross(dx, dy) + 1e-9));
  // How much surface a CSS pixel covers here, and the two scales around it.
  // Head-on that's set by the distance; on surfaces seen at a grazing angle
  // (the ground, the sides of things) a pixel spans far more along the view,
  // so the scale follows the pixel's longer side to keep strokes from
  // aliasing into moire rings. Clamped, because across a silhouette the
  // derivatives jump between surfaces.
  float headOn = uTanHalf * 2.0 * uPx / (uRes.y * dc);
  float cssWorld = clamp(max(length(dx), length(dy)) * uPx, headOn, headOn * 8.0);
  float level = log2(max(cssWorld, 1e-6));
  float scale0 = exp2(floor(level));
  float fade = level - floor(level);
  // The cross-hatch only darkens below this lightness (see "Cross-hatch the darks").
  bool hatch = Lq < 0.45;
  vec2 m;
  #ifdef LITE
  // Phones: only the plane the surface faces most.
  bool onX = n.x >= n.y && n.x >= n.z;
  bool onY = !onX && n.y >= n.z;
  vec2 plane = onX ? wp.zy : onY ? wp.xz + 17.0 : wp.xy + 31.0;
  m = marksOn(plane, onX ? 0.75 : onY ? 0.45 : 1.05, scale0, fade, along, follow, hatch);
  #else
  vec3 w = n * n * n * n;
  w /= w.x + w.y + w.z;
  w *= step(0.02, w);
  m = vec2(0.0);
  if (w.x > 0.0) m += w.x * marksOn(wp.zy, 0.75, scale0, fade, along, follow, hatch);
  if (w.y > 0.0) m += w.y * marksOn(wp.xz + 17.0, 0.45, scale0, fade, along, follow, hatch);
  if (w.z > 0.0) m += w.z * marksOn(wp.xy + 31.0, 1.05, scale0, fade, along, follow, hatch);
  m /= w.x + w.y + w.z;
  #endif
  float s = m.x;

  // Paper grain: crayon catches the tops of the tooth, misses the valleys.
  float grain = 0.55 * noise(tilt(css, 0.61) * band(0.75)) + 0.33 * noise(tilt(css, 1.13) * band(1.9) + 13.0) + 0.12 * noise(tilt(css, 2.29) * 0.2 + 5.0);
  float pressure = clamp(1.05 - Lq * 0.55, 0.25, 1.0);
  float cover = smoothstep(-0.06, 0.4, pressure * (0.5 + 0.7 * s) - grain * 0.6);
  vec3 col = mix(uPaper, wax * (0.9 + 0.2 * s), cover);

  // Cross-hatch the darks.
  float s2 = m.y;
  float dark = smoothstep(0.45, 0.1, Lq) * smoothstep(0.45, 0.8, s2) * smoothstep(0.2, 0.7, grain + 0.3);
  col = mix(col, col * 0.62, dark);

  // Light sources: a hatched halo around them, and no ink where they shine.
  float glow = glowAt(uv);
  float halo = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 d = vec2(cos(float(i) * 0.785398 + 0.3), sin(float(i) * 0.785398 + 0.3)) * uPx * texel;
    #ifdef LITE
    halo += 1.5 * glowAt(uv + d * 4.5);
    #else
    halo += glowAt(uv + d * 3.5) + 0.5 * glowAt(uv + d * 7.5);
    #endif
  }
  halo = clamp(halo / 9.0, 0.0, 1.0) * (1.0 - glow);
  col = mix(col, uHalo, smoothstep(0.1, 0.8, halo) * (0.25 + 0.45 * s));
  edge *= 1.0 - max(glow, smoothstep(0.15, 0.5, halo));

  // Wobbly ink outline, broken where the wax skips.
  float skip = smoothstep(0.15, 0.6, noise(tilt(css, 0.37) * vec2(band(0.6), band(0.9)) + 5.0) * 0.7 + grain * 0.6);
  col = mix(col, uInk, edge * skip * 0.92);

  // The light itself: solid wax, warmed toward white, no paper showing through.
  vec3 lit = mix(base, vec3(1.0, 0.98, 0.9), 0.3) * (0.95 + 0.08 * s);
  col = mix(col, lit, glow);

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * The full-screen crayon pass. Call `setSize` with the render target's size in
 * device pixels and the device pixel ratio, `setCamera` with the scene's
 * camera before each frame (to find the surfaces from depth), and `setBoil`
 * with the clock.
 * `lite` compiles a cheaper variant for phones and software renderers: one
 * halo ring and a four-neighbour depth edge, about a third fewer texture reads.
 * @param {{ color: import('three').Texture, depth: import('three').Texture, near: number, far: number, lite?: boolean }} input
 */
export function createCrayonPass({ color, depth, near, far, lite = false }) {
  const material = new ShaderMaterial({
    defines: lite ? { LITE: 1 } : {},
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: color },
      tDepth: { value: depth },
      uRes: { value: new Vector2(1, 1) },
      uPx: { value: 1 },
      uWobble: { value: WOBBLE_PX },
      uInvViewProj: { value: new Matrix4() },
      uTanHalf: { value: Math.tan((28 * Math.PI) / 180) },
      uBoilStrokes: { value: new Vector2() },
      uBoilWobble: { value: new Vector2() },
      uNear: { value: near },
      uFar: { value: far },
      uPaper: { value: srgb(PAPER) },
      uInk: { value: srgb(INK) },
      uHalo: { value: srgb('#FFB02E') },
    },
  });
  const scene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    scene,
    camera,
    material,
    /** @param {number} width @param {number} height @param {number} px */
    setSize(width, height, px) {
      material.uniforms.uRes.value.set(width, height);
      material.uniforms.uPx.value = px;
    },
    /** @param {import('three').PerspectiveCamera} camera */
    setCamera(camera) {
      material.uniforms.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
      material.uniforms.uTanHalf.value = Math.tan((camera.fov * Math.PI) / 360);
    },
    /** @param {number} seconds */
    setBoil(seconds) {
      const v = VARIANTS[boilStep(seconds)];
      material.uniforms.uBoilStrokes.value.fromArray(v.strokes);
      material.uniforms.uBoilWobble.value.fromArray(v.wobble);
    },
    dispose() {
      quad.geometry.dispose();
      material.dispose();
    },
  };
}

/** A palette colour as raw sRGB components, since the shader writes sRGB directly. */
function srgb(/** @type {string} */ hex) {
  const c = new Color();
  c.setHex(parseInt(hex.slice(1), 16), 'srgb-linear');
  return c;
}
