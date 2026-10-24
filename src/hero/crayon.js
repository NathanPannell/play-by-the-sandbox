// Crayon on the models themselves. No full-screen pass: each lit or unlit
// material in the scene is coloured in with wax strokes, and each solid gets
// an ink outline drawn as an inverted hull.
//
// The strokes come from one small texture made at load time (crayonTexture):
// overlapping tapered strokes with the paper showing through the gaps, a
// little wax tooth, and four slightly redrawn versions of the same strokes in
// its four channels. A material samples it triplanar in its own object space,
// so the strokes stick to the surface and move with it, at a fixed size on the
// object (STROKE_TILE metres a tile). Each face orientation turns the strokes
// its own way, as if coloured in by hand, and a second sample at another
// scale and angle keeps big walls from showing the tile. The wax takes the
// material's own colour; the gaps are a pale tint of it, lit like the rest of
// the surface, so they read as paper on the object rather than white speckle.
// Mipmaps and anisotropic filtering keep distant and grazing surfaces from
// shimmering.
//
// The outlines are back faces pushed out along smoothed normals by a constant
// width on screen, with a little jitter along their length.
//
// The boil: like hand-drawn animation, the drawing steps through its
// BOIL_VARIANTS redrawn versions BOIL_FPS times a second, the texture channel
// and the outline jitter together. A paused or reduced-motion frame holds one.
import {
  BackSide,
  BufferGeometry,
  Color,
  DataTexture,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NormalBlending,
  RepeatWrapping,
  RGBAFormat,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector4,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, PAPER } from './palette.js';

/** How many times a second the drawing boils to its next variant. */
export const BOIL_FPS = 5;
/** How many redrawn versions of the strokes the boil cycles through (one per texture channel). */
export const BOIL_VARIANTS = 4;
/** One tile of the stroke texture covers this much of a surface, in metres. */
export const STROKE_TILE = 1.6;
/** The ink outline's width on screen, in CSS pixels. */
export const OUTLINE_PX = 2;
/** The stroke texture's size in texels (square, tileable). */
export const TEXTURE_SIZE = 256;

/** Which variant the boil shows at a moment. @param {number} seconds */
export function boilStep(seconds) {
  const n = Math.floor(seconds * BOIL_FPS + 1e-6) % BOIL_VARIANTS;
  return n < 0 ? n + BOIL_VARIANTS : n;
}

/** A small seeded random generator (mulberry32). @param {number} seed */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The crayon strokes as RGBA data: wax coverage (0 paper, 255 solid wax) for
 * BOIL_VARIANTS redrawn versions of the same strokes, one per channel. It
 * tiles seamlessly: strokes and tooth wrap around the edges.
 * @param {number} [size]
 * @param {number} [seed]
 */
export function crayonTexture(size = TEXTURE_SIZE, seed = 2027) {
  const r = random(seed);
  const s = size / 256;
  // Hatching, the way a child colours in: rows of tapered strokes back and
  // forth along x (each face turns them its own way), a row apart with paper
  // between, overlapping and pressed harder or lighter, a few going astray.
  /** @type {{ x: number, y: number, angle: number, length: number, width: number, pressure: number, jitter: number[][] }[]} */
  const strokes = [];
  const jitter = () => Array.from({ length: BOIL_VARIANTS }, () => [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5]);
  const rowGap = 9.5 * s;
  const rows = Math.round(size / rowGap);
  for (let row = 0; row < rows; row++) {
    const y = ((row + 0.5) * size) / rows;
    const slope = (r() - 0.5) * 0.12;
    for (let x = r() * 40 * s; x < size;) {
      const length = (70 + r() * 90) * s;
      strokes.push({
        x: x + length / 2,
        y: y + (r() - 0.5) * 2.5 * s,
        angle: slope + (r() - 0.5) * 0.05,
        length,
        width: (5.5 + r() * 3.5) * s,
        pressure: 0.55 + r() * 0.45,
        jitter: jitter(),
      });
      x += length * (0.55 + r() * 0.5);
    }
  }
  for (let i = 0; i < Math.round(14 * s * s); i++) {
    strokes.push({
      x: r() * size,
      y: r() * size,
      angle: (r() - 0.5) * 0.9,
      length: (50 + r() * 70) * s,
      width: (4 + r() * 3) * s,
      pressure: 0.5 + r() * 0.4,
      jitter: jitter(),
    });
  }
  // The paper's tooth that the wax skips over: tileable value noise, a couple of texels across.
  const cells = Math.max(4, Math.round(size / 2.5));
  const lattice = Float32Array.from({ length: cells * cells }, () => r());
  /** @param {number} x @param {number} y */
  const tooth = (x, y) => {
    const fx = (x / size) * cells;
    const fy = (y / size) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const u = fx - x0;
    const v = fy - y0;
    const at = (/** @type {number} */ i, /** @type {number} */ j) =>
      lattice[(((j % cells) + cells) % cells) * cells + (((i % cells) + cells) % cells)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * u;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * u;
    return a + (b - a) * v;
  };

  const data = new Uint8Array(size * size * 4);
  const wax = new Float32Array(size * size);
  for (let k = 0; k < BOIL_VARIANTS; k++) {
    wax.fill(0);
    for (const st of strokes) {
      // Each variant redraws the stroke a little differently: shifted, turned, pressed.
      const [jx, jy, ja, jp] = st.jitter[k];
      const cx = st.x + jx * 2.4 * s;
      const cy = st.y + jy * 2.4 * s;
      const angle = st.angle + ja * 0.06;
      const pressure = Math.min(1, st.pressure * (1 + jp * 0.16));
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      for (let t = -st.length / 2; t <= st.length / 2; t += 1) {
        const along = t / st.length + 0.5;
        const radius = (st.width / 2) * Math.sin(Math.PI * along) ** 0.3;
        const px = cx + dx * t;
        const py = cy + dy * t;
        const reach = Math.ceil(radius + 1);
        const outer = (radius + 0.5) * (radius + 0.5);
        for (let oy = -reach; oy <= reach; oy++) {
          const iy = Math.floor(py) + oy;
          const ey = iy + 0.5 - py;
          const row = ((iy % size) + size) % size;
          for (let ox = -reach; ox <= reach; ox++) {
            const ix = Math.floor(px) + ox;
            const ex = ix + 0.5 - px;
            const d2 = ex * ex + ey * ey;
            if (d2 >= outer) continue;
            const cover = Math.min(1, radius + 0.5 - Math.sqrt(d2)) * pressure;
            const i = row * size + (((ix % size) + size) % size);
            if (cover > wax[i]) wax[i] = cover;
          }
        }
      }
    }
    for (let i = 0; i < size * size; i++) {
      const x = i % size;
      const y = (i / size) | 0;
      // Wax catches the tops of the tooth and misses the valleys.
      const v = wax[i] * Math.min(1, 0.45 + 0.85 * tooth(x, y));
      data[i * 4 + k] = Math.round(Math.min(1, v) * 255);
    }
  }
  return data;
}

/**
 * The texture for the GPU: repeating, mipmapped and anisotropically filtered,
 * so it neither tiles at the edges nor shimmers at a distance.
 * @param {number} [anisotropy]
 */
export function crayonMap(anisotropy = 1) {
  const map = new DataTexture(crayonTexture(), TEXTURE_SIZE, TEXTURE_SIZE, RGBAFormat);
  map.wrapS = map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = anisotropy;
  map.needsUpdate = true;
  return map;
}

const vertexPars = /* glsl */ `
varying vec3 vCrayonPos;
varying vec3 vCrayonNormal;
`;
const vertexMain = /* glsl */ `
vCrayonPos = position;
vCrayonNormal = normal;
`;
const fragmentPars = /* glsl */ `
uniform sampler2D tCrayon;
uniform vec4 uCrayonVariant;
uniform vec3 uCrayonPaper;
varying vec3 vCrayonPos;
varying vec3 vCrayonNormal;
// Sampled with explicit gradients (from the position, which is continuous), so
// a switch between projection planes or face angles doesn't make the GPU pick
// the blurriest mip along it and draw a seam.
float crayonAt(vec2 uv, vec2 gx, vec2 gy) { return dot(textureGrad(tCrayon, uv, gx, gy), uCrayonVariant); }
vec2 crayonTurn(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
// Each face orientation colours in at its own angle, as a hand would.
float crayonAngle(vec3 n) {
  vec3 q = floor(n * 3.0 + 0.5);
  return fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 3.14159;
}
// The strokes, pressed harder and lighter in broad patches (the same texture,
// far bigger and turned, so blurred by its mipmaps), which also keeps a big
// wall from showing the tile.
float crayonPlane(vec2 p, vec2 px, vec2 py, float a) {
  float k = 1.0 / ${STROKE_TILE.toFixed(3)};
  vec2 q = crayonTurn(p, a) * k;
  vec2 gx = crayonTurn(px, a) * k;
  vec2 gy = crayonTurn(py, a) * k;
  float pressure = crayonAt(crayonTurn(q, 1.9) * 0.11 + 0.37, crayonTurn(gx, 1.9) * 0.11, crayonTurn(gy, 1.9) * 0.11);
  return crayonAt(q, gx, gy) * mix(0.72, 1.18, pressure);
}
float crayonWax(vec3 p, vec3 n) {
  vec3 an = abs(n);
  float a = crayonAngle(n);
  vec3 dx = dFdx(p);
  vec3 dy = dFdy(p);
  #ifdef CRAYON_LITE
  // Phones: only the plane the surface faces most.
  bool onX = an.x >= an.y && an.x >= an.z;
  bool onY = !onX && an.y >= an.z;
  return crayonPlane(
    onX ? p.zy : onY ? p.xz : p.xy,
    onX ? dx.zy : onY ? dx.xz : dx.xy,
    onX ? dy.zy : onY ? dy.xz : dy.xy,
    a + (onX ? 0.0 : onY ? 0.7 : 1.4)
  );
  #else
  vec3 w = an * an * an * an;
  w /= w.x + w.y + w.z + 1e-6;
  float v = 0.0;
  if (w.x > 0.01) v += w.x * crayonPlane(p.zy, dx.zy, dy.zy, a);
  if (w.y > 0.01) v += w.y * crayonPlane(p.xz, dx.xz, dy.xz, a + 0.7);
  if (w.z > 0.01) v += w.z * crayonPlane(p.xy, dx.xy, dy.xy, a + 1.4);
  return v / max(0.01, (w.x > 0.01 ? w.x : 0.0) + (w.y > 0.01 ? w.y : 0.0) + (w.z > 0.01 ? w.z : 0.0));
  #endif
}
`;
const fragmentMain = /* glsl */ `
{
  // Wax in the material's colour, pressed a little unevenly; paper (a pale
  // tint of the colour, lit like the surface) where the strokes leave gaps.
  vec3 cn = vCrayonNormal;
  float wax = crayonWax(vCrayonPos, length(cn) > 0.0 ? normalize(cn) : vec3(0.0, 0.0, 1.0));
  float covered = smoothstep(0.2, 0.55, wax);
  // Dark colours (the marquee's backing, eyes, tyres) stay dark: the paper barely shows through them.
  float tone = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 paper = mix(diffuseColor.rgb, uCrayonPaper, mix(0.1, 0.6, smoothstep(0.01, 0.12, tone)));
  diffuseColor.rgb = mix(paper, diffuseColor.rgb * (0.82 + 0.3 * wax), covered);
}
`;

/**
 * Crayon for one scene: the stroke texture, the patch that puts it on
 * materials, the outlines, and the boil they share. Call `setSize` with the
 * canvas size in device pixels and the device pixel ratio, `setBoil` with the
 * clock, and `apply` once on the built scene.
 * @param {{ lite?: boolean, anisotropy?: number }} [options]
 */
export function createCrayon({ lite = false, anisotropy = 1 } = {}) {
  const map = crayonMap(anisotropy);
  const shared = {
    tCrayon: { value: map },
    uCrayonVariant: { value: new Vector4(1, 0, 0, 0) },
    uCrayonPaper: { value: new Color(PAPER) },
  };
  const outline = new ShaderMaterial({
    name: 'crayon-outline',
    side: BackSide,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uInk: { value: new Color(INK) },
        uWidth: { value: OUTLINE_PX },
        uRes: { value: new Vector2(1, 1) },
        uSeed: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      uniform vec2 uRes;
      uniform float uWidth;
      uniform float uSeed;
      float jitter(vec3 p) { return fract(sin(dot(floor(p * 5.0) + uSeed * 7.13, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        vec4 local = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mvPosition = modelViewMatrix * local;
        vec4 clip = projectionMatrix * mvPosition;
        // Out along the normal as seen on screen, by a constant width that wavers a little.
        vec2 dir = (projectionMatrix * vec4(normalize(mat3(modelViewMatrix) * n), 0.0)).xy;
        float len = length(dir);
        dir = len > 1e-5 ? dir / len : vec2(0.0);
        clip.xy += dir * uWidth * (0.7 + 0.6 * jitter(position)) * 2.0 / uRes * clip.w;
        gl_Position = clip;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uInk;
      void main() {
        gl_FragColor = vec4(uInk, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });

  /** @param {import('three').Material} material */
  function crayonize(material) {
    if (material.userData.crayon) return;
    material.userData.crayon = true;
    material.defines = { ...material.defines, ...(lite ? { CRAYON_LITE: 1 } : {}) };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, shared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${vertexPars}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexMain}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${fragmentPars}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${fragmentMain}`);
    };
    // One compiled program per variant of the patch, not per material.
    material.customProgramCacheKey = () => (lite ? 'crayon-lite' : 'crayon');
    material.needsUpdate = true;
  }

  /**
   * Colours in every opaque Lambert and basic material under root, and gives
   * the solids that asked for one (userData.hull, or userData.outline on their
   * own geometry) an ink outline. Solids that never move (userData.still)
   * share one outline, merged in world space: one draw call for all of them.
   * @param {import('three').Object3D} root
   */
  function apply(root) {
    /** @type {Mesh[]} */
    const outlined = [];
    root.traverse((object) => {
      const mesh = /** @type {Mesh} */ (object);
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const opaque = !m.transparent && m.blending === NormalBlending;
        if (opaque && (m instanceof MeshLambertMaterial || m instanceof MeshBasicMaterial)) crayonize(m);
      }
      if (mesh.userData.hull || mesh.userData.outline) outlined.push(mesh);
    });
    root.updateMatrixWorld(true);
    /** @type {BufferGeometry[]} */
    const still = [];
    for (const mesh of outlined) {
      if (mesh.userData.still && !(mesh instanceof InstancedMesh)) {
        still.push((mesh.userData.hull ?? hullGeometry(mesh.geometry)).clone().applyMatrix4(mesh.matrixWorld));
        continue;
      }
      const geometry = mesh.userData.hull ?? hullGeometry(mesh.geometry);
      /** @type {Mesh} */
      let hull;
      if (mesh instanceof InstancedMesh) {
        const inst = new InstancedMesh(geometry, outline, mesh.count);
        inst.instanceMatrix = mesh.instanceMatrix;
        inst.onBeforeRender = () => (inst.count = mesh.count);
        hull = inst;
      } else {
        hull = new Mesh(geometry, outline);
      }
      hull.name = 'outline';
      hull.frustumCulled = mesh.frustumCulled;
      hull.renderOrder = mesh.renderOrder;
      mesh.add(hull);
    }
    if (still.length) {
      const hull = new Mesh(mergeGeometries(still), outline);
      hull.name = 'outline';
      hull.userData.still = true;
      still.forEach((g) => g.dispose());
      root.add(hull);
    }
    return outlined.length;
  }

  return {
    map,
    outline,
    crayonize,
    apply,
    /** @param {number} width @param {number} height @param {number} px */
    setSize(width, height, px) {
      outline.uniforms.uRes.value.set(width, height);
      outline.uniforms.uWidth.value = OUTLINE_PX * px;
    },
    /** @param {number} seconds */
    setBoil(seconds) {
      const k = boilStep(seconds);
      shared.uCrayonVariant.value.set(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0, k === 3 ? 1 : 0);
      outline.uniforms.uSeed.value = k;
    },
    dispose() {
      map.dispose();
      outline.dispose();
    },
  };
}

/**
 * An outline hull for a solid: its shape with the faces' corners welded, so
 * the normals are smoothed and the pushed-out back faces close up at the edges.
 * @param {BufferGeometry} geometry
 */
export function hullGeometry(geometry) {
  const shape = new BufferGeometry();
  shape.setAttribute(
    'position',
    /** @type {import('three').BufferAttribute} */ (geometry.getAttribute('position')).clone(),
  );
  if (geometry.index) shape.setIndex(geometry.index.clone());
  const welded = mergeVertices(shape, 1e-4);
  shape.dispose();
  welded.computeVertexNormals();
  return welded;
}
