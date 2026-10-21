// The crayon pass. The scene renders into a target with a depth texture, then
// this full-screen shader redraws it on paper: hue-preserving posterised colour,
// waxy coverage that skips the paper's grain, hatched strokes that follow the
// luminance gradient near edges and run diagonally elsewhere, cross-hatching in
// the darks, a little colour bleed, glowing light sources with a halo, and
// wobbly ink outlines from a colour Sobel and a depth Laplacian (on inverse
// depth, which is flat across any plane, so the ground doesn't sprout contour
// lines).
//
// Nothing in it switches abruptly from one frame to the next, so it doesn't
// flicker as the camera turns: the paper grain and stroke textures are fixed
// to the screen, the posterised steps and the wax coverage are soft rather
// than hard thresholds, and the "boil" is a slow, capped drift of the outline
// wobble instead of a reseed.
import { Color, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from 'three';
import { INK, PAPER } from './palette.js';

/** How fast the outline wobble drifts, in noise cells per second. */
export const BOIL_SPEED = 0.35;
/** The most the wobble moves a line, in CSS pixels. */
export const WOBBLE_PX = 2.2;

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
uniform float uBoil;
uniform float uWobble;
uniform float uNear;
uniform float uFar;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uHalo;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
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
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float strokes(vec2 css, float angle, float offset) {
  vec2 r = rot(angle) * css;
  return 0.62 * noise(vec2(r.x * 0.045, r.y * 0.75) + offset) + 0.38 * noise(vec2(r.x * 0.11, r.y * 1.7) + offset * 1.7);
}
// A staircase with soft risers: posterised, but with no hard step to flip.
float softSteps(float x, float n) {
  float q = x * n;
  return (floor(q) + smoothstep(0.3, 0.7, fract(q))) / n;
}

void main() {
  vec2 css = gl_FragCoord.xy / uPx;
  vec2 texel = 1.0 / uRes;

  // A hand that never quite follows the line, drifting slowly.
  vec2 drift = vec2(uBoil, uBoil * 0.7);
  vec2 wob = vec2(noise(css * 0.03 + drift), noise(css * 0.03 - drift + 41.0)) - 0.5;
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
  float lapX = abs(invDepthAt(uv + k * vec2(-1.0, -1.0)) + invDepthAt(uv + k * vec2(1.0, 1.0)) + invDepthAt(uv + k * vec2(1.0, -1.0)) + invDepthAt(uv + k * vec2(-1.0, 1.0)) - 4.0 * dc);
  float depthEdge = max(lap, lapX * 0.5) / dc;
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
  float gl = length(g);
  float region = noise(css * 0.012 + 7.0);
  float diagonal = 0.75 + (region - 0.5) * 0.9;
  float along = atan(g.y, g.x) + 1.5708;
  float follow = smoothstep(0.12, 0.4, gl);
  float s = mix(strokes(css, diagonal, 0.0), strokes(css, along, 0.0), follow);

  // Paper grain: crayon catches the tops of the tooth, misses the valleys.
  float grain = 0.55 * noise(css * 0.75) + 0.33 * noise(css * 1.9 + 13.0) + 0.12 * noise(css * 0.2 + 5.0);
  float pressure = clamp(1.05 - Lq * 0.55, 0.25, 1.0);
  float cover = smoothstep(-0.06, 0.4, pressure * (0.5 + 0.7 * s) - grain * 0.6);
  vec3 col = mix(uPaper, wax * (0.9 + 0.2 * s), cover);

  // Cross-hatch the darks.
  float s2 = strokes(css, diagonal + 1.25, 3.0);
  float dark = smoothstep(0.45, 0.1, Lq) * smoothstep(0.45, 0.8, s2) * smoothstep(0.2, 0.7, grain + 0.3);
  col = mix(col, col * 0.62, dark);

  // Light sources: a hatched halo around them, and no ink where they shine.
  float glow = glowAt(uv);
  float halo = 0.0;
  for (int i = 0; i < 8; i++) {
    vec2 d = vec2(cos(float(i) * 0.785398 + 0.3), sin(float(i) * 0.785398 + 0.3)) * uPx * texel;
    halo += glowAt(uv + d * 3.5) + 0.5 * glowAt(uv + d * 7.5);
  }
  halo = clamp(halo / 9.0, 0.0, 1.0) * (1.0 - glow);
  col = mix(col, uHalo, smoothstep(0.1, 0.8, halo) * (0.25 + 0.45 * s));
  edge *= 1.0 - max(glow, smoothstep(0.15, 0.5, halo));

  // Wobbly ink outline, broken where the wax skips.
  float skip = smoothstep(0.15, 0.6, noise(css * vec2(0.6, 0.9) + 5.0) * 0.7 + grain * 0.6);
  col = mix(col, uInk, edge * skip * 0.92);

  // The light itself: solid wax, warmed toward white, no paper showing through.
  vec3 lit = mix(base, vec3(1.0, 0.98, 0.9), 0.3) * (0.95 + 0.08 * s);
  col = mix(col, lit, glow);

  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * The full-screen crayon pass. Call `setSize` with the render target's size in
 * device pixels and the device pixel ratio, and `setBoil` with the clock.
 * @param {{ color: import('three').Texture, depth: import('three').Texture, near: number, far: number }} input
 */
export function createCrayonPass({ color, depth, near, far }) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tColor: { value: color },
      tDepth: { value: depth },
      uRes: { value: new Vector2(1, 1) },
      uPx: { value: 1 },
      uBoil: { value: 0 },
      uWobble: { value: WOBBLE_PX },
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
    /** @param {number} seconds */
    setBoil(seconds) {
      // Wrapped to stay well inside float precision. The wrap is a jump, but
      // it comes round once every three hours.
      material.uniforms.uBoil.value = (seconds * BOIL_SPEED) % 4096;
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
