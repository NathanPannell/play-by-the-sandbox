// Premiere night at the Vancouver Art Gallery, in soft low-poly shapes drawn
// like a pastel picture book, seen from the middle of it. The camera stands on
// the carpet at eye height and turns a full circle, forever:
//
//   north  the gallery's neoclassical facade: columns with bases and
//          capitals, a dentilled cornice, the steps with the carpet running
//          up every riser, the dome, and the SANDBOX marquee mounted on the
//          portico, with bunting strung between the columns
//   east   the step-and-repeat wall with a director's chair, the projector
//          tower beaming the event's ads onto the big screen, a food truck
//   south  a balloon arch where the carpet meets the kerb, paparazzi behind
//          the ropes, limos pulling up, and the shops and hotel across the street
//   west   Robson Square's terraces and fountain, and activation tents
//
// with a crowd, influencers, phones and flashes all round, a skyline, the
// North Shore mountains under a lilac-and-peach dusk, searchlights, sparkles
// and confetti overhead.
//
// Everything is cel-shaded (MeshToonMaterial with three bands, lilac in the
// shade) in muted pastels from the site's palette. Everything that never
// moves is merged into one vertex-coloured mesh; the moving parts are a
// handful of meshes and instanced meshes. Every prop stands on something:
// feet on the ground or the carpet, posts on their bases, ropes hooked to the
// post tops, palms in their planters, bunting on the columns, the marquee
// bolted to the portico, and soft contact shadows under people and props.
// `update(t)` is a pure function of time, so a still frame at a given t always
// looks the same, and nothing in it switches on or off from one frame to the
// next: lights fade, flashes rise and fall over several frames, confetti and
// sparkles grow in and out of sight.
import {
  AddEquation,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CustomBlending,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  NoBlending,
  Object3D,
  OneFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RedFormat,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SrcAlphaFactor,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  ZeroFactor,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hullGeometry } from './crayon.js';
import { bulbLayout } from './marquee.js';
import {
  BRIGHTS,
  BUTTER,
  BUTTER_MID,
  COCOA,
  DUSK,
  INK,
  LILAC,
  LILAC_DEEP,
  LILAC_MID,
  MIDS,
  MINT,
  MINT_DEEP,
  MINT_MID,
  PAPER,
  PEACH,
  PEACH_MID,
  PLUM,
  ROSE,
  ROSE_DEEP,
  ROSE_MID,
  SKY,
  SKY_MID,
} from './palette.js';
import { hash1, rng } from './quality.js';

// Stone, ground and the odd material, all muted.
const STONE = '#F3E7D3';
const STONE_SHADE = '#E2D0B6';
const STONE_TRIM = '#FBF4E6';
const STONE_LINE = '#CDB89A';
const PAVING = '#EAD9BC';
const PAVING_LINE = '#DCC6A4';
const GROUND = '#C9B9A0';
const ROAD = '#857C99';
const KERB = '#E8DCCB';
const CARPET = ROSE_MID;
const BRASS = BUTTER_MID;
const ROPE = '#A9617A';
const WINDOW = '#FFE6B0';
const DOME = '#A9D3C2';
const WOOD = '#B99779';
const WOOD_DARK = '#9E7E66';
const METAL = '#B9B3CC';
const SHOE = PLUM;
const SKIN = ['#F8DAC6', '#EFC3A4', '#D9A27F', '#B07C5E', '#F3D9C4'];

/** The street (Georgia St) runs east-west along this line. */
const ROAD_Z = 23;
/** Where the carpet meets the kerb. */
const KERB_Z = ROAD_Z - 1.9;
/** The top of the carpet on the plaza: people on it stand here. */
const CARPET_TOP = 0.07;
/** The viewer: on the carpet, at eye height, between the street and the steps. */
export const EYE = new Vector3(0, 2.4, 13);
/** The projector tower's foot, and the centre of the big screen it beams at. */
const PROJECTOR = new Vector3(15, 0, 0.5);
const SCREEN = new Vector3(25.05, 7.4, 11);
/** Seconds per full turn of the camera. */
export const REVOLUTION = 75;
/** The moment drawn for reduced motion and the posters: facing the gallery, a limo at the kerb. */
export const STILL_T = 11.2;
const CYCLE = 26; // seconds for a limo to pull up, wait and leave
/** The six columns of the portico, and where they stand. */
const COLUMNS = [-8.4, -5, -1.7, 1.7, 5, 8.4];
const COLUMN_Z = -2.4;
/** Planters with palms at the corners of the carpet. */
const PALMS = [
  [-4.9, 3.75],
  [4.9, 3.75],
  [-5.5, KERB_Z - 1.2],
  [5.5, KERB_Z - 1.2],
];
/** The step-and-repeat wall, and the director's chair beside it. */
const CHAIR = new Vector3(5.2, 0, 11.9);

/**
 * Additive light (searchlight and projector beams): it adds to what's behind
 * and leaves the alpha alone. Not coloured in by crayon.js (it's light, not a
 * thing).
 */
const LIGHT_BEAM = {
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: SrcAlphaFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
};

/** @typedef {import('./quality.js').Quality} Quality */
/** @typedef {{ position: Vector3, weight: number }} Emitter */

/**
 * The cel-shading ramp: three flat bands with a crisp terminator where the
 * light crosses the surface (dark below 0, mid to 0.5, lit above).
 */
const TOON_RAMP = (() => {
  const ramp = new DataTexture(new Uint8Array([105, 105, 190, 255]), 4, 1, RedFormat);
  ramp.minFilter = ramp.magFilter = NearestFilter;
  ramp.generateMipmaps = false;
  ramp.needsUpdate = true;
  return ramp;
})();

/** A cel-shaded material. @param {import('three').MeshToonMaterialParameters} [params] */
export function toon(params = {}) {
  return new MeshToonMaterial({ gradientMap: TOON_RAMP, ...params });
}

/**
 * Collects static geometry with a baked colour, then merges it into one mesh.
 * The solid parts (not flat shapes, which have no inside) also make up the
 * mesh's ink outline hull (userData.hull, drawn by crayon.js).
 */
export class Batch {
  /** @type {BufferGeometry[]} */
  parts = [];
  /** @type {BufferGeometry[]} */
  solids = [];

  /**
   * @param {BufferGeometry} geometry
   * @param {string} color
   * @param {Matrix4 | null} [matrix]
   * @param {boolean} [outline] false to leave it out of the outline hull
   */
  add(geometry, color, matrix = null, outline = true) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const c = new Color(color);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
    g.setAttribute('color', new BufferAttribute(colors, 3));
    this.parts.push(g);
    if (outline && geometry.type !== 'ShapeGeometry' && geometry.type !== 'PlaneGeometry') {
      const solid = new BufferGeometry();
      solid.setAttribute('position', /** @type {BufferAttribute} */ (g.getAttribute('position')).clone());
      this.solids.push(solid);
    }
    geometry.dispose();
  }

  /** @param {number} w @param {number} h @param {number} d @param {string} color @param {number} x @param {number} y @param {number} z @param {number} [ry] */
  box(w, h, d, color, x, y, z, ry = 0) {
    this.add(new BoxGeometry(w, h, d), color, place(x, y, z, ry));
  }

  /** A box left out of the outline: small or flat details (windows, dentils) that an outline would only clutter. @param {number} w @param {number} h @param {number} d @param {string} color @param {number} x @param {number} y @param {number} z @param {number} [ry] */
  detail(w, h, d, color, x, y, z, ry = 0) {
    this.add(new BoxGeometry(w, h, d), color, place(x, y, z, ry), false);
  }

  /** @param {number} rt @param {number} rb @param {number} h @param {number} seg @param {string} color @param {number} x @param {number} y @param {number} z */
  cylinder(rt, rb, h, seg, color, x, y, z) {
    this.add(new CylinderGeometry(rt, rb, h, seg), color, place(x, y, z));
  }

  /**
   * A smooth ball, optionally squashed or stretched.
   * @param {number} r @param {string} color @param {number} x @param {number} y @param {number} z
   * @param {[number, number, number]} [scale] @param {number} [detail]
   */
  ball(r, color, x, y, z, scale = [1, 1, 1], detail = 10) {
    this.add(new SphereGeometry(r, detail, Math.max(6, Math.round(detail * 0.7))), color, placeScaled(x, y, z, scale));
  }

  /**
   * A tree: a trunk going into the ground and a crown of three soft clumps.
   * @param {number} x @param {number} z @param {number} h @param {number} r @param {number} [seed]
   */
  tree(x, z, h, r, seed = x * 7 + z) {
    this.cylinder(0.18, 0.28, h + 0.2, 6, WOOD, x, h / 2 - 0.1, z);
    const tones = [MINT_MID, MINT_DEEP, MINT];
    for (let k = 0; k < 3; k++) {
      const a = seed + k * 2.1;
      const rr = r * (0.75 + 0.15 * k);
      this.add(
        new IcosahedronGeometry(rr, k === 0 ? 1 : 0),
        tones[k],
        place(x + Math.cos(a) * r * 0.35, h + r * (0.55 + 0.25 * k), z + Math.sin(a) * r * 0.35, a),
      );
    }
  }

  /** A pole between two points. @param {Vector3} a @param {Vector3} b @param {number} r @param {string} color @param {number} [seg] */
  pole(a, b, r, color, seg = 6) {
    const dir = b.clone().sub(a);
    const m = new Matrix4().makeRotationFromQuaternion(
      new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()),
    );
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    this.add(new CylinderGeometry(r, r, dir.length(), seg), color, m);
  }

  /** A soft tube through points. @param {Vector3[]} points @param {number} r @param {string} color @param {number} [segments] */
  tube(points, r, color, segments = 16) {
    this.add(new TubeGeometry(new CatmullRomCurve3(points), segments, r, 6, false), color);
  }

  /** @param {boolean} lit cel-shaded, or unlit (stars, the moon) */
  mesh(lit = true) {
    const geometry = mergeGeometries(this.parts);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    const material = lit ? toon({ vertexColors: true }) : new MeshBasicMaterial({ vertexColors: true });
    const mesh = new Mesh(geometry, material);
    if (this.solids.length) {
      const solids = mergeGeometries(this.solids);
      mesh.userData.hull = hullGeometry(solids);
      solids.dispose();
      this.solids.forEach((p) => p.dispose());
      this.solids = [];
    }
    return mesh;
  }
}

/** @param {number} x @param {number} y @param {number} z @param {number} [ry] @param {number} [rx] @param {number} [rz] */
function place(x, y, z, ry = 0, rx = 0, rz = 0) {
  const o = new Object3D();
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.updateMatrix();
  return o.matrix;
}

/** @param {number} x @param {number} y @param {number} z @param {[number, number, number]} scale @param {number} [ry] @param {number} [rx] @param {number} [rz] */
function placeScaled(x, y, z, scale, ry = 0, rx = 0, rz = 0) {
  const o = new Object3D();
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.scale.set(...scale);
  o.updateMatrix();
  return o.matrix;
}

/**
 * Points along a hanging rope or string between two hooks: a catenary that
 * drops `sag` at its middle.
 * @param {Vector3} a @param {Vector3} b @param {number} sag @param {number} [n]
 */
function catenary(a, b, sag, n = 10) {
  const span = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  // y = k cosh(x / k) drops k (cosh(span / 2k) - 1) at the middle: find the k
  // that drops `sag` (bisection; a smaller k hangs deeper).
  let lo = 1e-3;
  let hi = 1e4;
  for (let i = 0; i < 60; i++) {
    const k = Math.sqrt(lo * hi);
    if (k * (Math.cosh(span / (2 * k)) - 1) > sag) lo = k;
    else hi = k;
  }
  const k = Math.sqrt(lo * hi);
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const p = a.clone().lerp(b, u);
    p.y += k * (Math.cosh((span * (u - 0.5)) / k) - Math.cosh(span / (2 * k)));
    return p;
  });
}

/** The projector's lens: on top of the tower, at the front of the projector. */
function projectorLens() {
  const top = new Vector3(PROJECTOR.x, 6.05, PROJECTOR.z);
  return top.addScaledVector(SCREEN.clone().sub(top).setY(0).normalize(), 0.95);
}

/** @param {number} x @param {number} min @param {number} max */
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
/** @param {number} a @param {number} b @param {number} x */
const smoothstep = (a, b, x) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

/** A soft round blob, dark in the middle and fading out: the contact shadows' alpha. */
const BLOB = (() => {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5;
      const dy = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.round(255 * (1 - r * r) ** 2);
      data.set([a, a, a, a], (y * n + x) * 4);
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat);
  // Smooth when stretched under a limo or the fountain.
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
})();

/** The contact shadows' material: a soft lilac blob, under everything else drawn on the ground. */
function shadowMaterial() {
  return new MeshBasicMaterial({
    color: '#7B6B98',
    transparent: true,
    opacity: 0.42,
    alphaMap: BLOB,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

/** Static contact shadows, merged: one flat blob per prop. */
class Shadows {
  /** @type {BufferGeometry[]} */
  parts = [];
  /** @param {number} x @param {number} z @param {number} w @param {number} d @param {number} [y] @param {number} [ry] */
  add(x, z, w, d, y = 0.012, ry = 0) {
    const g = new PlaneGeometry(w, d).rotateX(-Math.PI / 2);
    g.applyMatrix4(place(x, y, z, ry));
    this.parts.push(g);
  }
  mesh() {
    const mesh = new Mesh(mergeGeometries(this.parts), shadowMaterial());
    this.parts.forEach((p) => p.dispose());
    mesh.renderOrder = 1;
    mesh.name = 'contact-shadows';
    return mesh;
  }
}

/**
 * Builds the scene for a quality level.
 * @param {Quality} quality
 * @param {{ adTexture?: import('three').Texture | null }} [options]
 */
export function buildScene(quality, { adTexture = null } = {}) {
  const random = rng(2027);
  const scene = new Scene();
  scene.background = new Color('#A3A6D6');
  scene.fog = new Fog('#CDBCE0', 70, 215);

  const camera = new PerspectiveCamera(56, 16 / 9, 0.4, 260);
  camera.rotation.order = 'YXZ';

  // Warm low sun from the west-southwest; a lilac sky fills the shade.
  scene.add(new HemisphereLight('#FFF4EC', '#B6A3D8', 1.25));
  const sun = new DirectionalLight('#FFE8D4', 2.1);
  sun.position.set(-14, 26, 22);
  scene.add(sun);

  const shadows = new Shadows();

  // Everything that never moves, in one cel-shaded mesh with one outline.
  const still = new Batch();
  gallery(still);
  plaza(still, shadows);
  robsonSquare(still, shadows, random);
  eastSide(still, shadows);
  acrossTheStreet(still, random);
  skyline(still, random, quality.lite ? 26 : 44, !quality.lite);
  const marquee = marqueeSign(still);
  const scenery = still.mesh();
  scenery.name = 'scenery';

  const sky = skyDome();
  for (const part of [sky, scenery, marquee.group]) {
    part.traverse((o) => (o.userData.still = true));
    scene.add(part);
  }
  scene.add(shadows.mesh());

  const ad = adScreen(adTexture);
  scene.add(ad.group);

  const lights = searchlights(quality.searchlights);
  scene.add(lights.group);

  // Moving contact shadows (crowd, influencers, limos) share one instanced draw.
  const people = crowd(quality.crowd, quality.lite ? 6 : 12, random, quality.lite);
  const stars = influencers(random, quality.lite);
  const limos = [limo(ROSE), limo(PAPER)];
  const blobs = new InstancedMesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    shadowMaterial(),
    people.size + stars.size + limos.length,
  );
  blobs.instanceMatrix.setUsage(DynamicDrawUsage);
  blobs.frustumCulled = false;
  blobs.renderOrder = 1;
  blobs.name = 'moving-shadows';
  scene.add(people.group, stars.group, blobs);
  limos.forEach((l) => scene.add(l.group));

  const flashes = flashBulbs([...people.emitters, ...stars.emitters], quality.lite ? 14 : 22);
  scene.add(flashes.mesh);

  const paper = confetti(quality.confetti, random);
  scene.add(paper.mesh);

  const twinkles = sparkles(quality.lite ? 18 : 40, random);
  scene.add(twinkles.mesh);

  /**
   * Sets the lens for an aspect ratio: a wide view on landscape screens, and
   * on portrait ones a taller lens that still shows about 50 degrees across.
   * @param {number} aspect
   */
  function setAspect(aspect) {
    camera.aspect = aspect;
    // Portrait phones get a taller lens (up to 96 degrees) so the marquee and
    // the crowd still fit across about 52 degrees.
    const minHalfWidth = Math.tan((26 * Math.PI) / 180);
    const fitWidth = Math.atan(minHalfWidth / aspect);
    camera.fov = Math.min(96, Math.max(56, (fitWidth * 360) / Math.PI));
    camera.updateProjectionMatrix();
  }

  const shift = { x: 0, y: 0 };
  /**
   * Tilts the view, as fractions of the width and height, so the hero text
   * doesn't sit on top of what matters: up on phones, where the card is at
   * the bottom. (Sideways shift is accepted for compatibility; the view turns
   * all the way round anyway.)
   * @param {number} x
   * @param {number} y
   */
  function setShift(x, y) {
    shift.x = x;
    shift.y = y;
  }

  const m = new Matrix4();
  const limoAt = new Vector3();
  const limoSize = new Vector3(9, 1, 3);
  const noTurn = new Quaternion();
  /**
   * @param {number} t seconds
   * @param {number} [cameraT] where the camera is, if not at t (graphics QA
   *   holds the camera still while the scene plays)
   */
  function update(t, cameraT = t) {
    // The whole path, bob included, repeats exactly once per turn, so the
    // loop has no seam.
    const turn = ((cameraT - STILL_T) * Math.PI * 2) / REVOLUTION;
    const yaw = turn;
    const halfH = Math.tan((camera.fov * Math.PI) / 360);
    // Look up a little more while facing the gallery, so the marquee fits.
    const facingGallery = Math.max(0, Math.cos(yaw)) ** 2;
    const pitch = 0.05 + 0.2 * facingGallery + Math.sin(turn * 6) * 0.012 + Math.atan(shift.y * 2 * halfH);
    camera.position.set(EYE.x, EYE.y + Math.sin(turn * 11) * 0.04, EYE.z);
    camera.rotation.set(pitch, -yaw - Math.atan(shift.x * 2 * halfH * camera.aspect), 0);
    camera.updateMatrixWorld();

    marquee.update(t);
    ad.update(t);
    lights.update(t);
    let k = people.update(t, blobs, 0);
    k = stars.update(t, blobs, k);
    limos.forEach((l, i) => {
      l.update(t + i * (CYCLE / 2));
      // The limo's shadow: long and soft under it, wherever it is.
      blobs.setMatrixAt(k++, m.compose(limoAt.set(l.group.position.x, 0.03, ROAD_Z), noTurn, limoSize));
    });
    blobs.count = k;
    blobs.instanceMatrix.needsUpdate = true;
    flashes.update(t, camera.quaternion);
    paper.update(t);
    twinkles.update(t, camera.quaternion);
  }

  setAspect(16 / 9);
  update(0);

  return { scene, camera, update, setAspect, setShift, anchors: { marquee: marquee.anchor } };
}

/** The dusk sky, a pale moon and stars, and the North Shore mountains. */
function skyDome() {
  const geometry = new SphereGeometry(200, 24, 12);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color('#8F94CC') },
      mid: { value: new Color('#C6B4E0') },
      low: { value: new Color('#F5C4B2') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      varying vec3 vDir;
      void main() {
        // Lilac overhead, peach low down, warmest in the west behind Robson Square.
        float west = 0.45 + 0.55 * max(0.0, -vDir.x);
        vec3 c = mix(mix(mid, low, west), mid, smoothstep(-0.02, 0.2, vDir.y));
        c = mix(c, top, smoothstep(0.18, 0.62, vDir.y));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new Mesh(geometry, material);
  dome.renderOrder = -1;

  // A soft moon and a few stars, each turned to face the viewer.
  const b = new Batch();
  b.add(new CircleShape(5).geometry(), '#FFF6E2', place(-60, 66, -150, Math.atan2(60, 150)));
  const r = rng(7);
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + r() * 0.15;
    const d = 170;
    const y = 52 + r() * 55;
    b.add(
      starShape(0.9 + r() * 1.1, 0.45),
      i % 3 ? '#FFF7E6' : BUTTER,
      place(Math.sin(a) * d, y, -Math.cos(a) * d, -a),
    );
  }
  const lit = b.mesh(false);
  lit.renderOrder = -1;

  // The North Shore mountains, behind the gallery, softened by the haze.
  const hills = new Batch();
  const peaks = [
    [-130, 34, 50],
    [-80, 46, 46],
    [-40, 30, 40],
    [-5, 40, 52],
    [40, 34, 44],
    [80, 48, 50],
    [130, 36, 48],
  ];
  peaks.forEach(([x, tall, w], i) => {
    const h = tall * 0.65;
    hills.add(new CylinderGeometry(0, w, h, 5), i % 2 ? '#9A97C7' : '#A8A2CF', place(x, h / 2 - 2, -150, i));
    hills.add(new CylinderGeometry(0, w * 0.28, h * 0.28, 5), '#F8F3FF', place(x, h - h * 0.14 - 2, -150, i));
  });
  const ridge = hills.mesh();

  const group = new Group();
  group.add(dome, lit, ridge);
  return group;
}

/** A filled circle, as a tiny helper so the moon reads as a disc. */
class CircleShape {
  /** @param {number} r */
  constructor(r) {
    this.r = r;
  }
  geometry() {
    const s = new Shape();
    s.absarc(0, 0, this.r, 0, Math.PI * 2, false);
    return new ShapeGeometry(s, 12);
  }
}

/** @param {number} r outer radius @param {number} inner inner radius as a fraction */
function starShape(r, inner) {
  const s = new Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new ShapeGeometry(s);
}

/** A pennant: a little downward triangle of card, thick enough to have an outline. @param {number} w @param {number} h */
function pennant(w, h) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, -h);
  s.lineTo(-w / 2, 0);
  return new ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015);
}

/**
 * An Ionic column standing on the portico floor: a square plinth, a rounded
 * base, a gently tapering shaft with flutes, and a capital with scrolls.
 * @param {Batch} b @param {number} x @param {number} z @param {number} floor @param {number} top
 */
function column(b, x, z, floor, top) {
  b.box(1.7, 0.36, 1.7, STONE_TRIM, x, floor + 0.18, z);
  b.add(new TorusGeometry(0.66, 0.13, 5, 16), STONE, place(x, floor + 0.49, z, 0, Math.PI / 2));
  b.cylinder(0.7, 0.74, 0.16, 18, STONE_TRIM, x, floor + 0.44, z);
  const shaftBottom = floor + 0.6;
  const shaftTop = top - 0.75;
  const h = shaftTop - shaftBottom;
  b.cylinder(0.56, 0.66, h, 18, '#F8F1E3', x, shaftBottom + h / 2, z);
  // Flutes: shallow lines down the shaft, a crease every 45 degrees.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    b.add(
      new BoxGeometry(0.05, h * 0.92, 0.05),
      STONE_LINE,
      placeScaled(x + Math.sin(a) * 0.6, shaftBottom + h / 2, z + Math.cos(a) * 0.6, [1, 1, 1], a, 0, 0),
      false,
    );
  }
  // Capital: a collar, the echinus, scrolls either side, and the square abacus.
  b.cylinder(0.6, 0.58, 0.12, 18, STONE_TRIM, x, shaftTop + 0.06, z);
  b.cylinder(0.78, 0.6, 0.26, 18, STONE, x, shaftTop + 0.25, z);
  for (const sx of [-1, 1]) {
    b.add(new TorusGeometry(0.17, 0.07, 4, 10), STONE_TRIM, place(x + sx * 0.66, shaftTop + 0.3, z + 0.18));
    b.add(new TorusGeometry(0.17, 0.07, 4, 10), STONE_TRIM, place(x + sx * 0.66, shaftTop + 0.3, z - 0.18));
  }
  b.box(1.75, 0.22, 1.6, STONE_TRIM, x, top - 0.11, z);
}

/** @param {Batch} b */
function gallery(b) {
  // Podium and main block: front face at z = -6.
  b.box(46, 1.2, 15, STONE_SHADE, 0, 0.6, -13);
  b.box(42, 8.4, 13, STONE, 0, 5.4, -12.5);
  // A cornice with a row of dentils under it, all the way along.
  b.box(43, 0.7, 13.8, STONE_TRIM, 0, 9.95, -12.5);
  b.box(41, 0.9, 12, STONE_SHADE, 0, 10.75, -12.5);
  for (let x = -20.6; x <= 20.6; x += 0.62) b.detail(0.3, 0.3, 0.3, STONE_TRIM, x, 9.45, -5.95);
  // Side pavilions step forward.
  for (const sx of [-1, 1]) {
    b.box(9, 9.4, 14, STONE, sx * 17, 5.9, -12.4);
    b.box(9.8, 0.7, 14.6, STONE_TRIM, sx * 17, 10.9, -12.4);
    for (let x = 12.8; x <= 21.2; x += 0.62) b.detail(0.3, 0.3, 0.3, STONE_TRIM, sx * x, 10.4, -5.0);
    b.box(9, 0.5, 0.4, STONE_SHADE, sx * 17, 1.6, -5.25);
    // Lit windows, two floors, in frames with sills.
    for (const [wx, wz] of [
      [9, -5.9],
      [11.4, -5.9],
      [19.6, -5.3],
    ]) {
      for (const wy of [3.6, 7.3]) {
        b.box(1.4, 2.4, 0.2, STONE_TRIM, sx * wx, wy, wz + 0.02);
        b.detail(1.0, 1.9, 0.3, WINDOW, sx * wx, wy, wz + 0.05);
        b.detail(0.08, 1.9, 0.34, STONE_TRIM, sx * wx, wy, wz + 0.06);
        b.box(1.6, 0.16, 0.4, STONE_SHADE, sx * wx, wy - 1.25, wz + 0.1);
      }
    }
    // Banners hung from brackets on the pavilion walls.
    b.box(2.6, 6.2, 0.12, sx < 0 ? ROSE_MID : SKY_MID, sx * 15, 6.1, -5.15);
    b.box(2.6, 0.5, 0.14, BUTTER, sx * 15, 4.3, -5.08);
    b.pole(new Vector3(sx * 15 - 1.5, 9.3, -5.1), new Vector3(sx * 15 + 1.5, 9.3, -5.1), 0.06, BRASS);
    for (const dx of [-1.4, 1.4]) b.box(0.1, 0.1, 0.9, BRASS, sx * 15 + dx, 9.3, -5.5);
  }
  // Portico floor and steps (8 steps up to y = 2.2), each with a darker nosing line.
  b.box(21, 2.2, 5.6, STONE_SHADE, 0, 1.1, -3.6);
  for (let i = 0; i < 8; i++) {
    const h = 2.2 - i * 0.275;
    const front = -0.25 + i * 0.55;
    b.box(22 - i * 0.2, h, 0.6, i % 2 ? STONE : '#F5EADA', 0, h / 2, -0.55 + i * 0.55);
    b.add(new BoxGeometry(22 - i * 0.2, 0.05, 0.05), STONE_LINE, place(0, h - 0.03, front + 0.005), false);
  }
  // Six Ionic columns on the portico floor, up to the entablature.
  for (const x of COLUMNS) column(b, x, COLUMN_Z, 2.2, 10.0);
  // Entablature, and the pediment with its tympanum set clearly inside it.
  b.box(19.6, 1.3, 5.4, STONE_TRIM, 0, 10.65, -3.9);
  b.box(20.2, 0.22, 5.8, STONE_SHADE, 0, 11.36, -3.9);
  for (let x = -9.5; x <= 9.5; x += 0.6) b.detail(0.28, 0.26, 0.28, STONE_TRIM, x, 10.08, -1.12);
  const pediment = new Shape();
  pediment.moveTo(-10.2, 0);
  pediment.lineTo(10.2, 0);
  pediment.lineTo(0, 3.3);
  pediment.lineTo(-10.2, 0);
  b.add(new ExtrudeGeometry(pediment, { depth: 5.6, bevelEnabled: false }), STONE, place(0, 11.45, -6.6));
  const tympanum = new Shape();
  tympanum.moveTo(-8.4, 0);
  tympanum.lineTo(8.4, 0);
  tympanum.lineTo(0, 2.6);
  tympanum.lineTo(-8.4, 0);
  b.add(new ExtrudeGeometry(tympanum, { depth: 0.1, bevelEnabled: false }), STONE_SHADE, place(0, 11.8, -1.0));
  // The doorway: a warm glow in a moulded frame, double doors open.
  b.box(4.6, 6.0, 0.25, STONE_TRIM, 0, 5.2, -6.02);
  b.box(3.4, 5, 0.3, WINDOW, 0, 4.7, -5.98);
  b.box(4.8, 0.45, 0.6, STONE_SHADE, 0, 7.55, -5.85);
  for (const sx of [-1, 1]) b.box(0.12, 4.8, 1.3, SKY_MID, sx * 1.75, 4.6, -5.3, sx * 0.5);
  // Drum, dome and lantern.
  b.cylinder(4.6, 4.8, 2.6, 24, STONE, 0, 12.4, -13);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    b.detail(0.35, 2.2, 0.2, STONE_TRIM, Math.sin(a) * 4.72, 12.4, -13 + Math.cos(a) * 4.72, a);
  }
  b.cylinder(4.9, 4.9, 0.5, 24, STONE_TRIM, 0, 13.9, -13);
  b.add(new SphereGeometry(4.6, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), DOME, place(0, 14.1, -13));
  b.cylinder(0.9, 1.1, 1.4, 10, STONE_TRIM, 0, 19.3, -13);
  b.ball(0.5, BRASS, 0, 20.4, -13);

  // Bunting strung between the columns, hooked to each shaft below the marquee.
  for (let c = 0; c < COLUMNS.length - 1; c++) {
    const a = new Vector3(COLUMNS[c] + 0.55, 6.95, COLUMN_Z + 0.3);
    const z = new Vector3(COLUMNS[c + 1] - 0.55, 6.95, COLUMN_Z + 0.3);
    const string = catenary(a, z, 0.45, 12);
    b.tube(string, 0.025, PLUM, 16);
    const flags = Math.max(3, Math.round(a.distanceTo(z) / 0.62));
    for (let i = 1; i < flags; i++) {
      const u = i / flags;
      const p = catenary(a, z, 0.45, 60)[Math.round(u * 60)];
      b.add(pennant(0.44, 0.62), BRIGHTS[(c * 3 + i) % BRIGHTS.length], place(p.x, p.y, p.z));
    }
  }
}

/**
 * The plaza: the ground, the paving, the road and kerbs, the carpet running
 * up every step, brass stanchions with velvet ropes, palms in planters, the
 * balloon arch, potted shrubs and balloon bunches.
 * @param {Batch} b @param {Shadows} shadows
 */
function plaza(b, shadows) {
  // Ground all the way to the horizon, then the plaza, road and pavements on it.
  b.add(new CylinderGeometry(200, 200, 0.2, 24), GROUND, place(0, -0.3, 0), false);
  b.add(new BoxGeometry(150, 0.2, 54), PAVING, place(0, -0.1, -6), false);
  for (let z = 0; z < KERB_Z; z += 3) b.add(new BoxGeometry(60, 0.02, 0.08), PAVING_LINE, place(0, 0.01, z), false);
  for (let x = -27; x <= 27; x += 3)
    b.add(new BoxGeometry(0.08, 0.02, KERB_Z - 2.8), PAVING_LINE, place(x, 0.011, (KERB_Z + 2.8) / 2), false);
  b.add(new BoxGeometry(200, 0.2, 7.6), ROAD, place(0, -0.08, ROAD_Z + 1.9), false);
  b.box(200, 0.35, 0.4, KERB, 0, 0.05, KERB_Z);
  b.box(200, 0.35, 0.4, KERB, 0, 0.05, ROAD_Z + 5.7);
  for (let x = -90; x < 90; x += 4.4)
    b.add(new BoxGeometry(2.2, 0.03, 0.18), BUTTER, place(x, 0.04, ROAD_Z + 1.9), false);
  b.add(new BoxGeometry(200, 0.2, 60), '#E3D3B8', place(0, -0.1, ROAD_Z + 36), false);

  // The carpet, from the kerb up every step to the door: flat on each tread,
  // down each riser, and flat across the portico, with brass edging on the plaza.
  b.add(new BoxGeometry(3, 0.06, KERB_Z - 0.2 - 3.6), CARPET, place(0, 0.04, (KERB_Z - 0.2 + 3.6) / 2), false);
  for (const sx of [-1, 1])
    b.add(
      new BoxGeometry(0.1, 0.07, KERB_Z - 0.2 - 3.6),
      BRASS,
      place(sx * 1.52, 0.045, (KERB_Z - 0.2 + 3.6) / 2),
      false,
    );
  for (let i = 0; i < 8; i++) {
    const h = 2.2 - i * 0.275;
    const front = -0.25 + i * 0.55;
    const below = i < 7 ? 2.2 - (i + 1) * 0.275 : 0;
    // The tread: from this step's back edge (the riser above) to its nose.
    b.add(new BoxGeometry(3, 0.04, 0.57), CARPET, place(0, h + 0.02, front - 0.27), false);
    // The riser: down the front of the step to the tread below.
    b.add(new BoxGeometry(3, h - below + 0.04, 0.04), CARPET, place(0, (h + below) / 2, front + 0.02), false);
  }
  b.add(new BoxGeometry(3, 0.04, 5.5), CARPET, place(0, 2.22, -3.55), false);

  // Brass stanchions down both sides of the carpet: a weighted base on the
  // plaza, a post, a ball on top, and velvet ropes hooked to the balls.
  for (const sx of [-1, 1]) {
    /** @type {Vector3[]} */
    const tops = [];
    for (let z = 3.9; z <= KERB_Z - 0.6; z += 2.2) {
      const x = sx * 2.3;
      b.cylinder(0.3, 0.34, 0.08, 12, BRASS, x, 0.04, z);
      b.ball(0.2, BRASS, x, 0.08, z, [1, 0.45, 1], 8);
      b.cylinder(0.055, 0.065, 1.1, 8, BRASS, x, 0.68, z);
      b.ball(0.13, BRASS, x, 1.28, z, [1, 1, 1], 8);
      tops.push(new Vector3(x, 1.2, z));
      shadows.add(x, z, 0.9, 0.9);
    }
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i].clone().add(new Vector3(0, 0, 0.11));
      const c = tops[i + 1].clone().add(new Vector3(0, 0, -0.11));
      b.tube(catenary(a, c, 0.36, 12), 0.07, ROPE, 14);
      // The hooks at both ends.
      b.add(new TorusGeometry(0.06, 0.02, 4, 8), BRASS, place(a.x, a.y, a.z, 0, 0, Math.PI / 2));
      b.add(new TorusGeometry(0.06, 0.02, 4, 8), BRASS, place(c.x, c.y, c.z, 0, 0, Math.PI / 2));
    }
  }

  // A balloon arch over the carpet where it meets the kerb, standing on two weights.
  const archZ = KERB_Z - 1.1;
  for (const sx of [-1, 1]) {
    b.box(0.7, 0.3, 0.7, LILAC_MID, sx * 3.6, 0.15, archZ);
    shadows.add(sx * 3.6, archZ, 1.4, 1.4);
  }
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI;
    b.ball(0.43, BRIGHTS[i % BRIGHTS.length], Math.cos(a) * 3.6, 0.72 + Math.sin(a) * 5.0, archZ, [1, 1.08, 1], 9);
  }

  // Palms in round planters at the corners of the carpet, trunks curving up
  // out of the soil, fronds arching over.
  PALMS.forEach(([x, z], i) => palm(b, shadows, x, z, i));

  // Potted shrubs either side of the bottom step and on the portico.
  for (const [x, z, y] of [
    [-3.4, 4.2, 0],
    [3.4, 4.2, 0],
    [-4.6, -2.2, 2.2],
    [4.6, -2.2, 2.2],
  ]) {
    pottedShrub(b, x, z, y);
    if (y === 0) shadows.add(x, z, 1.4, 1.4);
  }

  // Bunches of balloons tied to the kerb-end stanchions.
  for (const sx of [-1, 1]) {
    const anchor = new Vector3(sx * 2.3, 1.28, KERB_Z - 0.6 - ((KERB_Z - 0.6 - 3.9) % 2.2));
    [
      [0.35, 2.9, 0.1, ROSE],
      [-0.25, 3.15, -0.2, SKY],
      [0.05, 3.45, 0.25, BUTTER],
    ].forEach(([dx, dy, dz, color]) => {
      const top = new Vector3(
        anchor.x + sx * /** @type {number} */ (dx),
        /** @type {number} */ (dy),
        anchor.z + /** @type {number} */ (dz),
      );
      b.ball(0.36, /** @type {string} */ (color), top.x, top.y, top.z, [1, 1.18, 1], 12);
      b.add(
        new ConeGeometry(0.07, 0.1, 6),
        /** @type {string} */ (color),
        place(top.x, top.y - 0.46, top.z, 0, Math.PI),
      );
      b.tube(
        [
          top.clone().setY(top.y - 0.5),
          anchor
            .clone()
            .lerp(top, 0.4)
            .setY(anchor.y + 0.9),
          anchor,
        ],
        0.012,
        PLUM,
        10,
      );
    });
  }
}

/**
 * A palm in a round planter: soil, a trunk that curves up in ringed segments,
 * coconuts and fronds that arch out and droop.
 * @param {Batch} b @param {Shadows} shadows @param {number} x @param {number} z @param {number} seed
 */
function palm(b, shadows, x, z, seed) {
  b.cylinder(0.85, 0.7, 0.9, 16, PEACH_MID, x, 0.45, z);
  b.add(new TorusGeometry(0.85, 0.08, 6, 20), PEACH, place(x, 0.9, z, 0, Math.PI / 2));
  b.cylinder(0.78, 0.78, 0.06, 16, COCOA, x, 0.86, z);
  shadows.add(x, z, 2.2, 2.2);
  // The trunk: from inside the soil, leaning and curving a little.
  const lean = new Vector3(Math.sin(seed * 2.3) * 0.5, 0, Math.cos(seed * 1.7) * 0.4);
  const points = Array.from({ length: 8 }, (_, k) => {
    const u = k / 7;
    return new Vector3(x + lean.x * u * u, 0.8 + u * 3.8, z + lean.z * u * u);
  });
  for (let k = 0; k < points.length - 1; k++) {
    const r = 0.2 - k * 0.012;
    b.pole(points[k], points[k + 1], r, k % 2 ? WOOD : WOOD_DARK, 8);
    b.add(
      new TorusGeometry(r + 0.01, 0.025, 4, 10),
      WOOD_DARK,
      place(points[k + 1].x, points[k + 1].y, points[k + 1].z, 0, Math.PI / 2),
      false,
    );
  }
  const crown = points[points.length - 1];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.ball(0.14, COCOA, crown.x + Math.cos(a) * 0.18, crown.y - 0.12, crown.z + Math.sin(a) * 0.18, [1, 1, 1], 8);
  }
  // A full crown: a lower ring of long fronds that arch out and droop, and a
  // shorter upper ring that stands up between them.
  const tones = [MINT_MID, '#A6D4B6', '#9CCBAE'];
  for (let f = 0; f < 9; f++) {
    const a = (f / 9) * Math.PI * 2 + seed;
    const reach = 2.3 + 0.35 * Math.sin(f * 1.7 + seed);
    b.add(frond(crown, a, reach, 0.55 + 0.2 * Math.cos(f * 2.1), 1.5, 0.36), tones[f % 3]);
  }
  for (let f = 0; f < 5; f++) {
    const a = ((f + 0.5) / 5) * Math.PI * 2 + seed * 1.3;
    b.add(frond(crown.clone().setY(crown.y + 0.08), a, 1.45, 1.05, 0.75, 0.3), tones[(f + 1) % 3]);
  }
}

/**
 * One palm frond as a closed leaf blade: it rises from the crown along a curve
 * that arches out and droops at the tip, tapers to a point at both ends,
 * folds up into a shallow V along its midrib near the crown, and sags at the
 * sides toward the tip, as a real leaf does under its own weight.
 * @param {Vector3} crown where it grows from
 * @param {number} angle which way it points, around the trunk
 * @param {number} reach how far out it goes
 * @param {number} lift how high it arches
 * @param {number} droop how far the tip falls
 * @param {number} width its half-width at the widest
 */
function frond(crown, angle, reach, lift, droop, width) {
  const n = 9;
  const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
  const at = (/** @type {number} */ u) =>
    crown
      .clone()
      .addScaledVector(dir, reach * u)
      .add(new Vector3(0, lift * Math.sin(u * Math.PI * 0.6) - droop * u * u, 0));
  const up = new Vector3(0, 1, 0);
  const positions = [];
  for (let k = 0; k <= n; k++) {
    const u = k / n;
    const c = at(u);
    const tangent = at(Math.min(1, u + 0.02))
      .sub(at(Math.max(0, u - 0.02)))
      .normalize();
    const side = new Vector3().crossVectors(tangent, up).normalize();
    const normal = new Vector3().crossVectors(side, tangent).normalize();
    // Narrow at the crown, widest a third of the way out, a point at the tip.
    const w = width * Math.sin(Math.PI * Math.pow(u, 0.62)) * (k === n ? 0 : 1);
    const fold = 0.45 - 1.0 * u; // edges up near the crown, sagging past the middle
    const t = 0.035 * (1 - u) + 0.008;
    // A diamond cross-section: left edge, midrib top, right edge, midrib underside.
    positions.push(
      c
        .clone()
        .addScaledVector(side, -w)
        .addScaledVector(normal, fold * w),
      c.clone().addScaledVector(normal, t),
      c
        .clone()
        .addScaledVector(side, w)
        .addScaledVector(normal, fold * w),
      c.clone().addScaledVector(normal, -t),
    );
  }
  const index = [];
  for (let k = 0; k < n; k++) {
    for (let j = 0; j < 4; j++) {
      const a0 = k * 4 + j;
      const a1 = k * 4 + ((j + 1) % 4);
      const b0 = a0 + 4;
      const b1 = a1 + 4;
      index.push(a0, a1, b0, a1, b1, b0);
    }
  }
  // Close both ends.
  const tip = n * 4;
  index.push(0, 2, 1, 0, 3, 2, tip, tip + 1, tip + 2, tip, tip + 2, tip + 3);
  const g = new BufferGeometry().setFromPoints(positions);
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A round pot with a bushy shrub of three clumps. @param {Batch} b @param {number} x @param {number} z @param {number} y */
function pottedShrub(b, x, z, y) {
  b.cylinder(0.45, 0.34, 0.6, 14, LILAC_MID, x, y + 0.3, z);
  b.add(new TorusGeometry(0.45, 0.05, 6, 16), LILAC, place(x, y + 0.6, z, 0, Math.PI / 2));
  b.cylinder(0.42, 0.42, 0.05, 14, COCOA, x, y + 0.57, z);
  b.ball(0.5, MINT_MID, x, y + 1.0, z, [1, 0.9, 1], 10);
  b.ball(0.36, MINT_DEEP, x + 0.25, y + 1.25, z + 0.1, [1, 1, 1], 10);
  b.ball(0.32, MINT, x - 0.2, y + 1.3, z - 0.15, [1, 1, 1], 10);
}

/**
 * The west side: Robson Square's stepped terraces with trees, a round
 * fountain and a row of brand activation tents.
 * @param {Batch} b @param {Shadows} shadows @param {() => number} random
 */
function robsonSquare(b, shadows, random) {
  // Terraces stepping up and away.
  for (let k = 0; k < 4; k++) {
    const x = -30 - k * 5;
    const h = 0.9 + k * 1.1;
    b.box(5, h, 30, k % 2 ? '#E8D7BC' : STONE_SHADE, x, h / 2, 6);
    b.box(4.2, 0.2, 29, MINT_MID, x, h + 0.1, 6);
    for (let z = -8; z <= 20; z += 7)
      b.tree(x + (random() - 0.5), z + random() * 2, 2.2 + random(), 1.3 + random() * 0.5);
  }
  // The fountain: a stone basin, water, and arcs of spray from the middle.
  b.cylinder(3.4, 3.6, 0.8, 24, STONE, -16, 0.4, 5);
  b.add(new TorusGeometry(3.4, 0.14, 6, 28), STONE_TRIM, place(-16, 0.8, 5, 0, Math.PI / 2));
  b.cylinder(3.15, 3.15, 0.1, 24, SKY, -16, 0.75, 5);
  b.cylinder(0.5, 0.7, 1.4, 12, STONE, -16, 1.4, 5);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const end = new Vector3(-16 + Math.cos(a) * 2.2, 0.8, 5 + Math.sin(a) * 2.2);
    b.tube(
      [new Vector3(-16, 2.1, 5), new Vector3(-16 + Math.cos(a) * 1.3, 2.6, 5 + Math.sin(a) * 1.3), end],
      0.08,
      '#E6F1FF',
      10,
    );
  }
  b.cylinder(0.12, 0.12, 2.4, 8, '#E6F1FF', -16, 3.2, 5);
  shadows.add(-16, 5, 8.4, 8.4);
  // Activation tents with peaked roofs and a sign on each.
  [
    [-12, 19, ROSE_MID],
    [-19, 16, SKY_MID],
    [-24, 10.5, LILAC_MID],
  ].forEach(([x, z, color], i) => {
    const xx = /** @type {number} */ (x);
    const zz = /** @type {number} */ (z);
    b.box(4.2, 2.4, 4.2, PAPER, xx, 1.2, zz, i * 0.4);
    b.add(new ConeGeometry(3.4, 2.2, 4), /** @type {string} */ (color), place(xx, 3.5, zz, i * 0.4 + Math.PI / 4));
    b.box(2.2, 0.8, 0.12, BUTTER, xx + Math.sin(i * 0.4) * 2.12, 1.8, zz + Math.cos(i * 0.4) * 2.12, i * 0.4);
    shadows.add(xx, zz, 6.2, 6.2, 0.012, i * 0.4);
  });
}

/**
 * The east side: the step-and-repeat wall with a director's chair and a
 * clapperboard, the projector tower, the big screen's truss and a food truck.
 * @param {Batch} b @param {Shadows} shadows
 */
function eastSide(b, shadows) {
  // Projector tower beside the gallery: a scaffold on foot plates, a platform
  // and the projector, aimed across the east side at the screen.
  const P = PROJECTOR;
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    b.box(0.4, 0.06, 0.4, METAL, P.x + dx, 0.03, P.z + dz);
    b.cylinder(0.1, 0.1, 5.3, 8, METAL, P.x + dx, 2.7, P.z + dz);
  }
  for (const y of [1.8, 3.6]) {
    b.pole(new Vector3(P.x - 1, y, P.z - 1), new Vector3(P.x + 1, y + 1.2, P.z + 1), 0.06, METAL);
    b.pole(new Vector3(P.x + 1, y, P.z - 1), new Vector3(P.x - 1, y + 1.2, P.z + 1), 0.06, METAL);
  }
  b.box(2.6, 0.25, 2.6, PLUM, P.x, 5.45, P.z);
  const lens = projectorLens();
  const aim = SCREEN.clone().sub(lens).setY(0).normalize();
  b.box(1.4, 0.9, 1.8, LILAC_MID, P.x, 6.0, P.z, Math.atan2(aim.x, aim.z));
  b.pole(lens.clone().addScaledVector(aim, -0.3), lens.clone().addScaledVector(aim, 0.1), 0.36, PLUM, 12);
  shadows.add(P.x, P.z, 3.4, 3.4);
  // Step-and-repeat photo wall beside the carpet, facing it, on two feet.
  b.box(0.3, 3.4, 7, PAPER, 6.4, 1.95, 7.5);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      b.box(0.06, 0.48, 0.48, MIDS[(r * 3 + c) % MIDS.length], 6.22, 0.85 + r * 0.75, 4.6 + c * 0.82 + (r % 2) * 0.41);
    }
  }
  for (const wz of [4.0, 11.0]) {
    b.cylinder(0.08, 0.08, 3.7, 8, PLUM, 6.5, 1.85, wz);
    b.box(1.2, 0.08, 0.3, PLUM, 6.5, 0.04, wz);
  }
  shadows.add(6.4, 7.5, 1.8, 7.8);
  directorsChair(b, shadows, CHAIR);
  // The big screen's truss: two towers on foot plates and a header.
  for (const z of [2.2, 19.8]) {
    b.box(1.6, 0.08, 1.6, METAL, 25, 0.04, z);
    for (const dx of [-0.5, 0.5]) {
      for (const dz of [-0.5, 0.5]) b.cylinder(0.08, 0.08, 13.5, 6, METAL, 25 + dx, 6.75, z + dz);
    }
    for (let y = 1; y < 13; y += 1.5)
      b.pole(new Vector3(24.5, y, z - 0.5), new Vector3(25.5, y + 1.5, z + 0.5), 0.05, METAL);
    shadows.add(25, z, 2.2, 2.2);
  }
  b.box(1.2, 1.0, 18.6, METAL, 25, 13.4, 11);
  // The screen's bezel, framing the picture (the picture itself is adScreen).
  b.box(0.5, 9.8, 16.8, PLUM, 25.35, 7.4, 11);
  // A food truck on its wheels, with an awning over the hatch.
  const ty = 17.6;
  b.box(6.5, 2.6, 2.6, BUTTER, 17, 2.0, ty, Math.PI / 2);
  b.box(6.6, 0.5, 2.7, ROSE_MID, 17, 3.5, ty, Math.PI / 2);
  b.box(0.1, 1.0, 3.2, DUSK, 15.68, 2.3, ty);
  b.box(0.8, 0.08, 3.6, ROSE, 15.3, 3.0, ty);
  for (const dz of [-2.2, 2.2]) {
    b.add(new CylinderGeometry(0.5, 0.5, 2.8, 14), PLUM, place(17, 0.5, ty + dz, 0, 0, Math.PI / 2));
    b.add(new CylinderGeometry(0.22, 0.22, 2.84, 10), LILAC, place(17, 0.5, ty + dz, 0, 0, Math.PI / 2), false);
  }
  shadows.add(17, ty, 3.6, 7.4);
  // Trees along the east edge.
  for (let z = -2; z <= 20; z += 5.5) {
    b.tree(31, z, 2.8, 1.6);
    shadows.add(31, z, 2.6, 2.6);
  }
}

/**
 * A director's chair on the plaza by the photo wall, a clapperboard leaning
 * against it.
 * @param {Batch} b @param {Shadows} shadows @param {Vector3} at
 */
function directorsChair(b, shadows, at) {
  const ry = -0.9;
  const local = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) =>
    new Vector3(x, y, z).applyAxisAngle(new Vector3(0, 1, 0), ry).add(at);
  // Crossed legs either side, armrests and back posts.
  for (const sx of [-1, 1]) {
    b.pole(local(sx * 0.32, 0, -0.28), local(sx * 0.32, 0.62, 0.28), 0.035, WOOD);
    b.pole(local(sx * 0.32, 0, 0.28), local(sx * 0.32, 0.62, -0.28), 0.035, WOOD);
    b.pole(local(sx * 0.32, 0.62, -0.3), local(sx * 0.32, 1.25, -0.32), 0.035, WOOD);
    b.pole(local(sx * 0.32, 0.86, -0.3), local(sx * 0.32, 0.86, 0.3), 0.03, WOOD);
  }
  // Canvas seat and back.
  const seat = local(0, 0.62, 0);
  b.add(new BoxGeometry(0.66, 0.04, 0.56), LILAC_MID, place(seat.x, seat.y, seat.z, ry));
  const back = local(0, 1.08, -0.32);
  b.add(new BoxGeometry(0.66, 0.3, 0.04), LILAC_MID, place(back.x, back.y, back.z, ry));
  // The clapperboard, leaning on the chair's front legs.
  const slate = local(0.05, 0.27, 0.42);
  b.add(new BoxGeometry(0.5, 0.36, 0.04), DUSK, place(slate.x, slate.y, slate.z, ry, -0.25));
  b.add(new BoxGeometry(0.5, 0.08, 0.05), PAPER, place(slate.x, slate.y + 0.22, slate.z - 0.06, ry, -0.25));
  for (let k = 0; k < 4; k++) {
    const s = local(-0.18 + k * 0.12, 0.49, 0.36);
    b.add(new BoxGeometry(0.05, 0.085, 0.055), INK, place(s.x, s.y, s.z, ry + 0.4, -0.25), false);
  }
  shadows.add(at.x, at.z, 1.3, 1.2, 0.012, ry);
}

/**
 * The south side of the street: a row of shops with lit windows, awnings and
 * signs, and the hotel tower with its copper roof.
 * @param {Batch} b @param {() => number} random
 */
function acrossTheStreet(b, random) {
  const z0 = ROAD_Z + 7;
  let x = -70;
  let i = 0;
  while (x < 70) {
    const w = 7 + random() * 6;
    const h = 7 + random() * 12;
    const color = ['#C9B6DE', '#F2C3B5', '#B9CFEA', '#EED7AE', '#BFDCC8'][i % 5];
    b.box(w - 0.4, h, 8, color, x + w / 2, h / 2, z0 + 4);
    b.box(w - 0.2, 0.4, 8.4, STONE_TRIM, x + w / 2, h + 0.2, z0 + 4);
    for (let y = 3.5; y < h - 1.5; y += 3) {
      for (let k = 0; k < Math.floor(w / 2.4); k++) {
        if (random() > 0.3) b.detail(1.1, 1.4, 0.3, WINDOW, x + 1.4 + k * 2.4, y, z0 - 0.05);
      }
    }
    b.box(w - 1.4, 1.8, 0.3, '#FFEBC2', x + w / 2, 1.2, z0 - 0.05);
    b.box(w - 1, 0.25, 1.4, MIDS[i % MIDS.length], x + w / 2, 2.55, z0 - 0.7);
    x += w;
    i++;
  }
  // The hotel: a tall block with a pitched copper roof.
  b.box(16, 34, 14, '#E6D2B6', 24, 17, z0 + 22);
  b.add(new ConeGeometry(11.5, 9, 4), MINT_DEEP, place(24, 38.5, z0 + 22, Math.PI / 4));
  for (let y = 4; y < 33; y += 3.2) {
    for (let k = 0; k < 5; k++) if (random() > 0.35) b.detail(1.2, 1.5, 0.3, WINDOW, 18.5 + k * 2.8, y, z0 + 14.9);
  }
  // Street trees on both pavements.
  for (let tx = -60; tx <= 60; tx += 9) {
    if (Math.abs(tx) > 6) b.tree(tx + 2, KERB_Z - 0.9, 2.6, 1.2);
    b.tree(tx - 2, ROAD_Z + 6.4, 2.6, 1.2);
  }
}

/**
 * City towers in a ring all round, with lit windows facing the viewer (left
 * off on lighter devices: they are most of the triangles and far away).
 * @param {Batch} b @param {() => number} random @param {number} count @param {boolean} windows
 */
function skyline(b, random, count, windows) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + random() * 0.08;
    // Leave the view north, over the gallery, to the mountains.
    if (Math.cos(a) > Math.cos(0.35)) continue;
    const r = 75 + random() * 40;
    const px = Math.sin(a) * r;
    const pz = EYE.z - Math.cos(a) * r;
    const h = 16 + random() * 42;
    const w = 7 + random() * 8;
    const ry = -a;
    b.box(w, h, w, ['#A39FCB', '#B3A8D2', '#9A98C6'][i % 3], px, h / 2, pz, ry);
    // Windows on the face toward the viewer.
    const fx = -Math.sin(a);
    const fz = Math.cos(a);
    const sideX = Math.cos(a);
    const sideZ = Math.sin(a);
    for (let y = 3; y < h - 2; y += 3.4) {
      for (let k = -1; k <= 1; k++) {
        if (random() > 0.45 && windows) {
          b.detail(
            1.1,
            1.4,
            0.4,
            WINDOW,
            px + fx * (w / 2 + 0.15) + sideX * k * (w / 3.4),
            y,
            pz + fz * (w / 2 + 0.15) + sideZ * k * (w / 3.4),
            ry,
          );
        }
      }
    }
  }
}

/**
 * An unlit material for light sources (the marquee, camera flashes,
 * sparkles): full colour, warmed toward white, no crayon strokes and no
 * outline. Works on plain and instanced meshes.
 */
export function glowMaterial() {
  return new ShaderMaterial({
    userData: { glow: true },
    blending: NoBlending,
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        vec4 local = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * local;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        gl_FragColor = vec4(mix(vColor, vec3(1.0, 0.98, 0.9), 0.3), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** The marquee letters' warm, soft yellow. */
export const MARQUEE_YELLOW = '#FFDFA0';

/**
 * SANDBOX in marquee lights on a plum board across the front of the portico,
 * in a rounded brass frame, bolted to the entablature above and braced back
 * to the columns: solid, touching letter pixels that glow a soft warm yellow,
 * bulbs on top with a travelling sparkle, and a chaser border that fades
 * rather than blinks. The letters themselves never dim, so the word reads.
 * The board and frame go into the scenery batch `b`; the lights are their own.
 * @param {Batch} b
 */
function marqueeSign(b) {
  const group = new Group();
  const W = 13.4;
  const H = 3.3;
  const y = 9.3;
  const z = 0.0;
  b.box(W, H, 0.5, DUSK, 0, y, z);
  // The frame: rails round the board, rounded posts at the corners.
  b.box(W + 0.4, 0.38, 0.7, BRASS, 0, y + H / 2 + 0.05, z);
  b.box(W + 0.4, 0.38, 0.7, BRASS, 0, y - H / 2 - 0.05, z);
  for (const sx of [-1, 1]) {
    b.box(0.38, H + 0.4, 0.7, BRASS, (sx * (W + 0.3)) / 2, y, z);
    for (const sy of [-1, 1]) b.ball(0.32, BUTTER, (sx * (W + 0.3)) / 2, y + (sy * (H + 0.1)) / 2, z, [1, 1, 1], 10);
    // Braces back to the columns behind it, and hangers up to the entablature.
    b.box(0.26, 0.26, 1.7, PLUM, sx * (W / 2 - 1.5), y - 0.6, z - 1.05);
    b.add(new BoxGeometry(0.42, 0.42, 0.08), BRASS, place(sx * (W / 2 - 1.5), y - 0.6, z - 1.9));
    b.pole(
      new Vector3(sx * (W / 2 - 1.2), y + H / 2 + 0.2, z - 0.1),
      new Vector3(sx * (W / 2 - 1.2), 10.95, -1.15),
      0.06,
      PLUM,
    );
    b.box(0.5, 0.12, 0.3, BRASS, sx * (W / 2 - 1.2), 10.95, -1.1);
  }

  const spacing = 0.3;
  const pixels = bulbLayout('SANDBOX').map((p) => ({
    x: p.x * spacing,
    y: y + p.y * spacing,
    column: Math.round(p.x),
  }));
  const letters = new InstancedMesh(new BoxGeometry(spacing, spacing, 0.12), glowMaterial(), pixels.length);
  const bulbs = new InstancedMesh(new SphereGeometry(0.085, 8, 6), glowMaterial(), pixels.length);
  const m = new Matrix4();
  const letterColor = new Color(MARQUEE_YELLOW);
  pixels.forEach((p, i) => {
    letters.setMatrixAt(i, m.makeTranslation(p.x, p.y, z + 0.31));
    letters.setColorAt(i, letterColor);
    bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, z + 0.4));
  });

  // Chaser bulbs around the border.
  /** @type {{ x: number, y: number, phase: number }[]} */
  const border = [];
  const nx = 26;
  const ny = 6;
  const inset = 0.32;
  for (let i = 0; i < nx; i++) {
    const x = -W / 2 + inset + (i / (nx - 1)) * (W - 2 * inset);
    border.push({ x, y: y + H / 2 - inset, phase: i }, { x, y: y - H / 2 + inset, phase: 2 * nx - i });
  }
  for (let i = 1; i < ny - 1; i++) {
    const yy = y - H / 2 + inset + (i / (ny - 1)) * (H - 2 * inset);
    border.push({ x: -W / 2 + inset, y: yy, phase: 2 * nx + i }, { x: W / 2 - inset, y: yy, phase: nx - i });
  }
  const chasers = new InstancedMesh(new SphereGeometry(0.13, 8, 6), glowMaterial(), border.length);
  border.forEach((p, i) => chasers.setMatrixAt(i, m.makeTranslation(p.x, p.y, z + 0.32)));
  [bulbs, chasers].forEach((mesh) => {
    mesh.setColorAt(0, letterColor);
    mesh.instanceColor?.setUsage(DynamicDrawUsage);
  });
  letters.name = 'marquee-letters';
  bulbs.name = 'marquee-bulbs';
  chasers.name = 'marquee-chasers';
  group.add(letters, bulbs, chasers);

  const white = new Color('#FFF8EA');
  const warm = new Color('#FFE7B8');
  const amber = new Color('#E9B48A');
  const c = new Color();
  let shown = NaN;
  /** @param {number} time */
  function update(time) {
    // The lights move in smooth waves, so 20 updates a second is plenty, and
    // it saves re-uploading every bulb's colour on every frame.
    const t = Math.floor(time * 20) / 20;
    if (t === shown) return;
    shown = t;
    // Smooth waves, not steps: a sparkle sweeping across the letters, and a
    // chase running round the border.
    pixels.forEach((p, i) => {
      const sparkle = smoothstep(0.55, 1, 0.5 + 0.5 * Math.sin(p.column * 0.8 - t * 2.4));
      bulbs.setColorAt(i, c.lerpColors(warm, white, sparkle));
    });
    border.forEach((p, i) => {
      const lit = (0.5 + 0.5 * Math.sin(p.phase * 1.05 - t * 4)) ** 3;
      chasers.setColorAt(i, c.lerpColors(amber, white, lit));
    });
    [bulbs, chasers].forEach((mesh) => {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
  /** The sign's lower right corner, where a speech bubble can point up at it. */
  const anchor = new Vector3(W / 2 - 1.2, y - H / 2 - 0.2, z + 0.4);
  return { group, update, anchor };
}

/**
 * The big screen on the east truss and the projector's beam from the tower,
 * right over the crowd. With a texture, the panels cycle through the site's
 * own ads; without one, through procedural pastel panels.
 * @param {import('three').Texture | null} texture
 */
function adScreen(texture) {
  const group = new Group();
  const w = 16;
  const h = 9;
  const center = SCREEN;
  const material = new ShaderMaterial({
    uniforms: {
      tAds: { value: texture },
      uHasAds: { value: texture ? 1 : 0 },
      uTime: { value: 0 },
      uColors: { value: [ROSE_MID, SKY_MID, BUTTER, MINT_MID, LILAC_MID, PEACH_MID].map((c) => new Color(c)) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tAds; uniform float uHasAds; uniform float uTime; uniform vec3 uColors[6];
      varying vec2 vUv;
      void main() {
        float slide = floor(uTime / 3.2);
        float local = fract(uTime / 3.2);
        float idx = mod(slide, 4.0);
        vec2 cell = vec2(mod(idx, 2.0), floor(idx / 2.0));
        vec3 ad = texture2D(tAds, (vUv + cell) * 0.5).rgb;
        // Procedural panels: a colour field with a bouncing sun and stripes.
        vec3 a = uColors[int(mod(slide, 6.0))];
        vec3 b = uColors[int(mod(slide + 2.0, 6.0))];
        float stripes = smoothstep(0.45, 0.55, fract((vUv.x + vUv.y) * 4.0 - uTime * 0.4));
        float sun = 1.0 - smoothstep(0.21, 0.23, length(vUv - vec2(0.5, 0.45 + 0.08 * sin(uTime * 2.0))));
        vec3 panel = mix(mix(a, a * 0.85, stripes), b, sun);
        // The site's ads, softened toward the evening's pastels.
        vec3 c = mix(panel, mix(ad, vec3(0.96, 0.92, 0.9), 0.18), uHasAds);
        // Each slide fades up from a little darker over half a second.
        gl_FragColor = vec4(c * 0.9 * mix(0.82, 1.0, smoothstep(0.0, 0.15, local)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const screen = new Mesh(new PlaneGeometry(w, h), material);
  screen.position.copy(center);
  screen.rotation.y = -Math.PI / 2;
  group.add(screen);

  // Beam from the projector lens to the four corners of the screen, bright at
  // the lens and fading toward the screen.
  const lens = projectorLens();
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([dz, dy]) => new Vector3(center.x - 0.05, center.y + dy, center.z - dz));
  const pos = [];
  const col = [];
  const bright = new Color('#FFF1D8').multiplyScalar(0.16);
  const faint = new Color('#FFF1D8').multiplyScalar(0.02);
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const c = corners[(i + 1) % 4];
    pos.push(lens.x, lens.y, lens.z, a.x, a.y, a.z, c.x, c.y, c.z);
    col.push(...bright.toArray(), ...faint.toArray(), ...faint.toArray());
  }
  const beamGeometry = new BufferGeometry();
  beamGeometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  beamGeometry.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  const beamMaterial = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    ...LIGHT_BEAM,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  group.add(new Mesh(beamGeometry, beamMaterial));

  /** @param {number} t */
  function update(t) {
    material.uniforms.uTime.value = t;
  }
  return { group, update };
}

/** @param {number} count */
function searchlights(count) {
  const group = new Group();
  const spots = [
    [-45, -40, 0],
    [45, -40, 1.7],
    [-70, 20, 3.1],
    [70, 18, 4.4],
    [-35, 85, 2.2],
    [40, 90, 5.3],
  ].slice(0, count);
  const material = new MeshBasicMaterial({
    color: '#FFF1E2',
    transparent: true,
    opacity: 0.06,
    ...LIGHT_BEAM,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const geometry = new CylinderGeometry(2.6, 0.3, 120, 14, 1, true);
  geometry.translate(0, 60, 0);
  /** @type {{ pivot: Object3D, phase: number }[]} */
  const beams = [];
  for (const [x, z, phase] of spots) {
    const pivot = new Object3D();
    pivot.position.set(x, 0, z);
    pivot.add(new Mesh(geometry, material));
    group.add(pivot);
    beams.push({ pivot, phase });
  }
  /** @param {number} t */
  function update(t) {
    for (const { pivot, phase } of beams) {
      pivot.rotation.set(0, 0, 0);
      pivot.rotateY(t * 0.3 + phase);
      pivot.rotateZ(0.3 + 0.1 * Math.sin(t * 0.4 + phase));
    }
  }
  return { group, update };
}

/**
 * Bakes a colour into a geometry's vertices, for parts merged into one
 * instanced shape (a crowd member's legs and shoes, eyes, hair). The instance
 * colour multiplies it, so white parts take the instance colour.
 * @param {BufferGeometry} geometry @param {string} color @param {Matrix4} [matrix]
 */
function tinted(geometry, color, matrix) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (matrix) g.applyMatrix4(matrix);
  g.deleteAttribute('uv');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const c = new Color(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

/**
 * A crowd member from the shoes to the shoulders: the instance colour is their
 * top; trousers and shoes are darker. `low` is the lite tiers' version, with
 * fewer sides to everything (there are a hundred of them, outlined).
 * @param {boolean} low
 */
function crowdBody(low) {
  const parts = [];
  const sides = low ? 5 : 7;
  for (const sx of [-1, 1]) {
    parts.push(tinted(new CylinderGeometry(0.085, 0.075, 0.74, sides, 1, true), '#9A8FA8', place(sx * 0.11, 0.43, 0)));
    parts.push(tinted(new IcosahedronGeometry(0.1, 0), SHOE, placeScaled(sx * 0.11, 0.055, 0.05, [0.95, 0.55, 1.4])));
  }
  parts.push(tinted(new CylinderGeometry(0.21, 0.25, 0.66, low ? 6 : 9), '#FFFFFF', place(0, 1.1, 0)));
  if (!low)
    parts.push(
      tinted(
        new SphereGeometry(0.22, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2),
        '#FFFFFF',
        placeScaled(0, 1.42, 0, [1.05, 0.5, 0.95]),
      ),
    );
  parts.push(tinted(new CylinderGeometry(0.26, 0.26, 0.06, low ? 6 : 9, 1, true), '#C7BACB', place(0, 0.8, 0)));
  return mergeGeometries(parts);
}

/** The eyes, the same on everyone: small solid dots, a little taller than wide, with no outline. */
const EYE_INK = '#3A2A30';

/**
 * A crowd member's head on its neck: the instance colour is the skin; the eyes
 * are baked in, the hair is its own mesh. The neck reaches down into the
 * shoulders, so no gap opens under it. The outline hull (userData.hull) is the
 * head and neck only: an ink ring round each little eye made them stare.
 * @param {boolean} low the lite tiers' version
 */
function crowdHead(low) {
  const solid = [
    tinted(new CylinderGeometry(0.06, 0.07, 0.18, 5, 1, true), '#FFFFFF', place(0, 0.02, 0)),
    low
      ? tinted(new IcosahedronGeometry(0.2, 1), '#FFFFFF', place(0, 0.29, 0))
      : tinted(new SphereGeometry(0.2, 10, 7), '#FFFFFF', place(0, 0.29, 0)),
  ];
  const eyes = [-1, 1].map((sx) =>
    tinted(
      new SphereGeometry(0.019, low ? 5 : 6, low ? 3 : 4),
      EYE_INK,
      placeScaled(sx * 0.068, 0.285, 0.182, [1, 1.3, 0.6]),
    ),
  );
  const geometry = mergeGeometries([...solid, ...eyes]);
  const outline = mergeGeometries(solid.map((g) => g.clone().deleteAttribute('color').deleteAttribute('normal')));
  geometry.userData.hull = hullGeometry(outline);
  outline.dispose();
  return geometry;
}

/**
 * A crowd member's hair, placed like the head: a cap, or with `long` a cap
 * and hair falling to the shoulders behind. The instance colour is the hair's.
 * @param {boolean} low the lite tiers' version @param {boolean} long
 */
function crowdHair(low, long) {
  const parts = [
    tinted(
      new SphereGeometry(0.212, low ? 7 : 10, low ? 3 : 4, 0, Math.PI * 2, 0, Math.PI * 0.52),
      '#FFFFFF',
      placeScaled(0, 0.31, -0.02, [1, 1, 1], 0, -0.25),
    ),
  ];
  if (long)
    parts.push(
      tinted(new IcosahedronGeometry(0.2, low ? 0 : 1), '#FFFFFF', placeScaled(0, 0.16, -0.1, [1, 1.3, 0.55])),
    );
  return mergeGeometries(parts);
}

/** Hair colours for the crowd: dark, brown, auburn, fair, grey and a few dyed pastels. */
const CROWD_HAIR = [
  '#5C4A52',
  '#3A3342',
  COCOA,
  '#5C4A52',
  PEACH_MID,
  BUTTER_MID,
  '#B9AFB4',
  LILAC_DEEP,
  ROSE_MID,
  COCOA,
];

/** Where a crowd member's hand is, in the frame of one arm (`crowdArm`). */
export const CROWD_HAND = new Vector3(0, -0.6, 0.01);
/** A crowd member's shoulders, in their body's frame (scaled by their build). */
export const CROWD_SHOULDER = new Vector3(0.27, 1.38, 0);

/**
 * One arm hanging from its shoulder (the origin), the hand at the bottom
 * (`CROWD_HAND`); turn the instance to point it. The shoulder is a ball, so
 * the arm stays joined to the body however it is raised.
 * @param {boolean} low the lite tiers' version
 */
function crowdArm(low) {
  const sides = low ? 5 : 6;
  return mergeGeometries([
    tinted(new SphereGeometry(0.066, sides, 3), '#FFFFFF'),
    tinted(new CylinderGeometry(0.06, 0.055, 0.56, sides, 1, true), '#FFFFFF', place(0, -0.28, 0)),
    tinted(new IcosahedronGeometry(0.075, 0), '#FFFFFF', place(CROWD_HAND.x, CROWD_HAND.y, CROWD_HAND.z)),
  ]);
}

/**
 * The crowd all round: instanced bodies (tops, trousers, shoes), heads with
 * hair and eyes, arms down or raised, phones, and a row of paparazzi with
 * cameras behind the ropes near the kerb. Everyone stands on the plaza, with
 * a soft shadow under their feet.
 * @param {number} count
 * @param {number} paparazzi
 * @param {() => number} random
 * @param {boolean} [low] fewer sides to everything (lite tiers)
 */
function crowd(count, paparazzi, random, low = false) {
  const group = new Group();
  /** @type {{ x: number, z: number, h: number, w: number, phase: number, phone: boolean, camera: boolean, arms: boolean, front: boolean, hair: number, hairColor: string, ry: number }[]} */
  const folks = [];

  /** @param {number} x @param {number} z */
  const blocked = (x, z) =>
    Math.hypot(x - EYE.x, z - EYE.z) < 5.5 || // the viewer
    (Math.abs(x) < 3.0 && z > 2.6 && z < KERB_Z + 0.4) || // the carpet
    (z < 2.8 && Math.abs(x) < 24) || // the gallery and its steps
    (z > KERB_Z - 0.4 && z < ROAD_Z + 5.9) || // the road
    Math.hypot(x + 16, z - 5) < 4.2 || // the fountain
    Math.hypot(x - PROJECTOR.x, z - PROJECTOR.z) < 2.2 || // the projector tower
    [
      [-12, 19],
      [-19, 16],
      [-24, 10.5],
    ].some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 3.6) || // the tents
    (x > 5.9 && x < 7.2 && z > 3.4 && z < 11.6) || // the photo wall
    Math.hypot(x - CHAIR.x, z - CHAIR.z) < 1.1 || // the director's chair
    (x > 13.4 && x < 20.6 && z > 15.8 && z < 19.4) || // the food truck
    x > 23.5 || // the screen
    x < -27 || // the terraces
    PALMS.some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.6) || // planters
    [
      [-3.4, 4.2],
      [3.4, 4.2],
      [-3.6, KERB_Z - 1.1],
      [3.6, KERB_Z - 1.1],
    ].some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.0); // shrubs and the arch's feet

  /** @param {number} x @param {number} z */
  const crowded = (x, z) => folks.some((f) => Math.hypot(f.x - x, f.z - z) < 0.8);
  /** A look for one person: build, hair and colouring vary, and a few are children. */
  const look = () => {
    const child = random() < 0.06;
    const h = child ? 0.64 + random() * 0.08 : 0.84 + random() * 0.3;
    return {
      h,
      w: h * (0.86 + random() * 0.3),
      // Lite tiers skip long hair: one hair mesh, two fewer draw calls.
      hair: random() < 0.38 ? (low ? 2 : 1) : random() < 0.3 ? 2 : 0,
      hairColor: CROWD_HAIR[Math.floor(random() * CROWD_HAIR.length)],
    };
  };

  // Paparazzi first, in two short rows at the kerb end of the ropes.
  for (let i = 0; i < paparazzi; i++) {
    const sx = i % 2 ? 1 : -1;
    const x = sx * (3.1 + (Math.floor(i / 2) % 3) * 0.95);
    const z = KERB_Z - 2.6 - Math.floor(i / 6) * 2.4 - (Math.floor(i / 2) % 3) * 0.5;
    folks.push({
      x,
      z,
      ...look(),
      h: 0.95,
      w: 0.95 + random() * 0.15,
      phase: random() * 6.3,
      phone: false,
      camera: true,
      arms: false,
      front: false,
      ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
    });
  }
  // Everyone else comes in little groups of one to five, standing together:
  // most of them within 22 m, a few on the far pavement.
  let guard = 0;
  while (folks.length < count + paparazzi && guard++ < count * 40) {
    let cx;
    let cz;
    const far = random() < 0.12;
    if (far) {
      cx = (random() - 0.5) * 80;
      cz = ROAD_Z + 6.6 + random() * 1.2;
    } else {
      const a = random() * Math.PI * 2;
      const r = 5.8 + Math.sqrt(random()) * 18;
      cx = EYE.x + Math.sin(a) * r;
      cz = EYE.z + Math.cos(a) * r;
    }
    const size = 1 + Math.floor(random() ** 1.4 * 5);
    const chatting = size > 2 && random() < 0.35;
    for (let j = 0; j < size && folks.length < count + paparazzi; j++) {
      const a = random() * Math.PI * 2;
      const d = j === 0 ? 0 : 0.6 + random() * 0.45;
      const x = cx + Math.cos(a) * d;
      const z = far ? Math.min(ROAD_Z + 7.9, Math.max(ROAD_Z + 6.4, cz + Math.sin(a) * d * 0.5)) : cz + Math.sin(a) * d;
      if (z <= ROAD_Z + 5.9 && blocked(x, z)) continue;
      if (crowded(x, z)) continue;
      // Face the carpet if beside it, each other if chatting, otherwise the viewer.
      const byCarpet = Math.abs(x) < 14 && z > 2.6 && z < KERB_Z;
      const [tx, tz] = byCarpet ? [0, z] : chatting && j > 0 ? [cx, cz] : [EYE.x, EYE.z];
      const near = Math.hypot(x - EYE.x, z - EYE.z) < 10;
      const phone = !(chatting && !byCarpet) && (near ? random() > 0.45 : random() > 0.72);
      const arms = phone || random() > 0.78;
      folks.push({
        x,
        z,
        ...look(),
        phase: random() * Math.PI * 2,
        phone,
        camera: false,
        arms,
        front: !arms && random() < 0.45,
        ry: Math.atan2(tx - x, tz - z) + (random() - 0.5) * 0.5,
      });
    }
  }
  const n = folks.length;
  const material = toon({ vertexColors: true });
  const body = new InstancedMesh(crowdBody(low), material, n);
  const head = new InstancedMesh(crowdHead(low), material, n);
  head.userData.hull = head.geometry.userData.hull;
  const shortHaired = folks.filter((f) => f.hair !== 1);
  const longHaired = folks.filter((f) => f.hair === 1);
  const hairShort = new InstancedMesh(crowdHair(low, false), material, Math.max(1, shortHaired.length));
  const hairLong = new InstancedMesh(crowdHair(low, true), material, Math.max(1, longHaired.length));
  /** Each person's slot in their hair mesh. */
  const hairSlot = folks.map((f) => (f.hair === 1 ? longHaired : shortHaired).indexOf(f));
  // Two arms each, so each can reach on its own: slots 2i and 2i + 1.
  const arms = new InstancedMesh(crowdArm(low), material, n * 2);
  const phones = new InstancedMesh(new BoxGeometry(0.16, 0.28, 0.04), new MeshBasicMaterial({ color: '#E3EEFB' }), n);
  const cameras = new InstancedMesh(
    mergeGeometries([
      tinted(new BoxGeometry(0.34, 0.24, 0.22), DUSK),
      tinted(new CylinderGeometry(0.08, 0.09, 0.22, 10), PLUM, place(0, 0, 0.2, 0, Math.PI / 2)),
    ]),
    toon({ vertexColors: true }),
    Math.max(1, paparazzi),
  );
  for (const m of [body, head, arms, cameras, hairShort, hairLong]) m.userData.outline = true;
  body.name = 'crowd-bodies';
  head.name = 'crowd-heads';
  arms.name = 'crowd-arms';
  phones.name = 'crowd-phones';
  cameras.name = 'crowd-cameras';
  hairShort.name = 'crowd-hair';
  hairLong.name = 'crowd-hair-long';
  const skin = SKIN.map((c) => new Color(c));
  folks.forEach((f, i) => {
    const top = f.camera ? DUSK : (random() < 0.5 ? MIDS : BRIGHTS)[Math.floor(random() * 6)];
    body.setColorAt(i, new Color(top));
    head.setColorAt(i, skin[i % skin.length]);
    arms.setColorAt(i * 2, skin[i % skin.length]);
    arms.setColorAt(i * 2 + 1, skin[i % skin.length]);
    (f.hair === 1 ? hairLong : hairShort).setColorAt(hairSlot[i], new Color(f.hairColor));
  });
  hairShort.count = shortHaired.length;
  hairLong.count = longHaired.length;
  [body, head, hairShort, hairLong, arms, phones, cameras].forEach((m) => {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    if (m !== hairLong || longHaired.length) group.add(m);
  });

  /** Where phones and cameras flash, as live positions. Cameras fire more. */
  const devices = folks.filter((f) => f.phone || f.camera);
  /** @type {Emitter[]} */
  const emitters = devices.map((f) => ({ position: new Vector3(f.x, 2, f.z), weight: f.camera ? 3 : 1 }));

  const m = new Matrix4();
  const q = new Quaternion();
  const reach = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const up = new Vector3(0, 1, 0);
  const down = new Vector3(0, -1, 0);
  const flat = new Quaternion();
  const built = new Vector3();
  const puff = new Vector3();
  const shoulder = new Vector3();
  const dir = new Vector3();
  const hands = [new Vector3(), new Vector3()];
  /** The phone's centre above the hand gripping its lower end. */
  const phoneGrip = new Vector3(0, 0.085, 0);
  /**
   * A direction for an arm, in the body's frame: from shoulder x `from`, so
   * the hand (at `length`) ends at body x `to`, rising `rise` radians from
   * straight ahead (negative is down).
   * @param {number} from @param {number} to @param {number} length @param {number} rise
   */
  const aim = (from, to, length, rise) => {
    const dx = clamp((to - from) / length, -0.95, 0.95);
    const k = Math.sqrt(1 - dx * dx);
    return dir.set(dx, k * Math.sin(rise), k * Math.cos(rise));
  };
  /**
   * Points one arm (`side` -1 or 1) of person `i` along `direction` (body
   * frame) from their shoulder, and returns where its hand is, in world space.
   * @param {number} i @param {number} side @param {Vector3} direction @param {number} hop
   */
  const pose = (i, side, direction, hop) => {
    const f = folks[i];
    shoulder
      .set(side * CROWD_SHOULDER.x * f.w, CROWD_SHOULDER.y * f.h, 0)
      .applyQuaternion(q)
      .add(p.set(f.x, hop, f.z));
    reach.setFromUnitVectors(down, direction.normalize()).premultiply(q);
    const slot = i * 2 + (side > 0 ? 1 : 0);
    arms.setMatrixAt(slot, m.compose(shoulder, reach, built));
    return hands[side > 0 ? 1 : 0].copy(CROWD_HAND).applyMatrix4(m);
  };
  /**
   * @param {number} t
   * @param {InstancedMesh} blobs the shared contact shadows; fills from `slot`
   * @param {number} slot
   */
  function update(t, blobs, slot) {
    let k = 0;
    let c = 0;
    folks.forEach((f, i) => {
      // A smooth bounce on the toes: no kinks, so nothing snaps from one frame to the next.
      const hop = (0.5 - 0.5 * Math.cos(t * 3.2 + f.phase)) ** 2 * 0.12 * (f.arms ? 1 : 0.3);
      q.setFromAxisAngle(up, f.ry + Math.sin(t * 0.8 + f.phase) * 0.12);
      s.set(f.h, f.h, f.h);
      built.set(f.w, f.h, f.w);
      body.setMatrixAt(i, m.compose(p.set(f.x, hop, f.z), q, built));
      head.setMatrixAt(i, m.compose(p.set(f.x, hop + 1.47 * f.h, f.z), q, s));
      // Short hair can be a fuller, wider cut.
      puff.copy(s);
      if (f.hair === 2) puff.x = puff.z = s.x * 1.12;
      (f.hair === 1 ? hairLong : hairShort).setMatrixAt(hairSlot[i], m.compose(p, q, f.hair === 1 ? s : puff));
      // Arms from the shoulders: down (clear of the hips), hands together in
      // front, raised and cheering, one up holding a phone, or both up to the
      // face holding a camera. Whatever they hold is placed from the hands.
      const from = CROWD_SHOULDER.x * f.w;
      const length = -CROWD_HAND.y * f.h;
      const wave = 0.15 * Math.sin(t * 2.1 + f.phase);
      for (const sx of [-1, 1]) {
        if (f.camera) pose(i, sx, aim(sx * from, sx * 0.2, length, 0.78), hop);
        else if (f.phone && sx > 0) pose(i, sx, aim(from, 0.12, length, 1.05 + wave), hop);
        else if (f.arms && !f.phone) pose(i, sx, dir.set(sx * 0.35, 0.9, 0.3 + wave), hop);
        else if (f.front) pose(i, sx, aim(sx * from, sx * 0.08, length, -0.98), hop);
        else pose(i, sx, dir.set(sx * 0.15, -1, 0.06), hop);
      }
      if (f.camera) {
        // Held in both hands, which grip its sides.
        p.copy(hands[0]).add(hands[1]).multiplyScalar(0.5);
        cameras.setMatrixAt(c++, m.compose(p, q, s.set(1, 1, 1)));
        emitters[devices.indexOf(f)].position.copy(p);
      } else if (f.phone) {
        // Upright in the raised hand, which closes round its lower end.
        p.copy(phoneGrip).applyQuaternion(q).add(hands[1]);
        phones.setMatrixAt(k++, m.compose(p, q, s.set(1, 1, 1)));
        emitters[devices.indexOf(f)].position.copy(p);
      }
      // The contact shadow: a little smaller and lighter while they're up on their toes.
      const size = 0.95 * f.w * (1 - hop * 1.5);
      blobs.setMatrixAt(slot + i, m.compose(p.set(f.x, 0.014, f.z), flat.identity(), s.set(size, 1, size * 0.85)));
    });
    phones.count = k;
    cameras.count = c;
    [body, head, hairShort, hairLong, arms, phones, cameras].forEach(
      (mesh) => (mesh.instanceMatrix.needsUpdate = true),
    );
    return slot + n;
  }
  return { group, update, emitters, size: n };
}

/**
 * One influencer, built in a Batch with their feet at the origin, facing +z:
 * shoes, legs (or a skirt), a top with a collar and a belt, arms with hands
 * (one on the hip, one up holding a phone or a selfie stick), a neck, a round
 * head with eyes, cheeks, a nose and a smile, and hair (a bob, a ponytail or
 * a bun). Returns where the phone is, for the flashes, and the hand holding it.
 * @param {Batch} b
 * @param {{ outfit: string, hair: string, skin: string, case: string, stick: boolean, skirt: boolean, style: number }} look
 */
function figure(b, look) {
  const { outfit, hair, skin } = look;
  const trousers = look.skirt ? skin : PLUM;
  for (const sx of [-1, 1]) {
    b.ball(0.11, SHOE, sx * 0.12, 0.06, 0.06, [0.95, 0.55, 1.45], 10);
    b.cylinder(0.08, 0.095, 0.82, 7, trousers, sx * 0.12, 0.49, 0);
  }
  if (look.skirt) b.add(new CylinderGeometry(0.24, 0.4, 0.5, 14), outfit, place(0, 0.9, 0));
  // The top, with a darker belt and a collar.
  b.add(new CylinderGeometry(0.22, 0.27, 0.62, 11), outfit, place(0, 1.2, 0));
  b.add(
    new SphereGeometry(0.235, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    outfit,
    placeScaled(0, 1.5, 0, [1.08, 0.48, 0.98]),
  );
  b.add(new CylinderGeometry(0.275, 0.275, 0.07, 14), look.skirt ? BUTTER_MID : PLUM, place(0, 0.92, 0));
  b.add(new TorusGeometry(0.1, 0.035, 6, 12), STONE_TRIM, place(0, 1.6, 0, 0, Math.PI / 2));
  b.cylinder(0.065, 0.075, 0.16, 10, skin, 0, 1.66, 0);
  // Head and face. The eyes are small solid dots like the crowd's, with no
  // outline: an ink ring round them made them stare.
  const hy = 1.92;
  b.ball(0.24, skin, 0, hy, 0, [1, 1.02, 1], 12);
  for (const sx of [-1, 1]) {
    b.add(new SphereGeometry(0.024, 8, 6), EYE_INK, placeScaled(sx * 0.082, hy - 0.005, 0.222, [1, 1.3, 0.6]), false);
    b.ball(0.045, ROSE, sx * 0.14, hy - 0.06, 0.18, [1, 0.6, 0.4], 8);
  }
  b.ball(0.035, skin, 0, hy - 0.03, 0.235, [1, 0.9, 1], 8);
  b.add(new TorusGeometry(0.055, 0.012, 4, 10, Math.PI), INK, place(0, hy - 0.08, 0.215, 0, 0, Math.PI), false);
  // Hair.
  b.add(
    new SphereGeometry(0.255, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hair,
    placeScaled(0, hy + 0.02, -0.025, [1, 1, 1], 0, -0.3),
  );
  b.ball(0.16, hair, 0, hy + 0.17, 0.12, [1.25, 0.45, 0.7], 10);
  if (look.style === 1) b.ball(0.12, hair, 0, hy - 0.05, -0.26, [0.8, 1.6, 0.8], 10);
  if (look.style === 2) b.ball(0.12, hair, 0, hy + 0.27, -0.06, [1, 1, 1], 10);
  // Arms in sleeves to the elbow, then bare forearms and hands. Balls at the
  // shoulders and elbows keep each joint closed whatever its angle.
  /** @param {Vector3} shoulder @param {Vector3} elbow @param {Vector3} hand */
  const arm = (shoulder, elbow, hand) => {
    b.ball(0.066, outfit, shoulder.x, shoulder.y, shoulder.z, [1, 1, 1], 8);
    b.pole(shoulder, elbow, 0.06, outfit, 8);
    b.ball(0.06, outfit, elbow.x, elbow.y, elbow.z, [1, 1, 1], 8);
    b.pole(elbow, hand, 0.052, skin, 8);
    b.ball(0.075, skin, hand.x, hand.y, hand.z, [1, 1, 1], 8);
  };
  // Left arm: elbow out, hand on the hip.
  arm(new Vector3(-0.29, 1.5, 0), new Vector3(-0.47, 1.2, -0.02), new Vector3(-0.28, 0.98, 0.04));
  // Right arm: up, holding the phone or the selfie stick.
  const rHand = new Vector3(0.46, 2.1, 0.22);
  arm(new Vector3(0.29, 1.5, 0), new Vector3(0.48, 1.78, 0.1), rHand);
  // The phone: a pastel case, its screen out toward the crowd. On a short
  // selfie stick in light metal, gripped in the hand, it sits on the stick's
  // end; otherwise it stands in the hand, which closes round its lower end.
  const face = new Vector3(0, 1.9, 2);
  const tip = look.stick ? new Vector3(0.74, 2.66, 0.5) : rHand.clone();
  const phone = new Matrix4().lookAt(tip, face, new Vector3(0, 1, 0));
  if (look.stick) {
    b.pole(rHand, tip, 0.028, METAL, 6);
    b.pole(rHand.clone().lerp(tip, -0.12), rHand.clone().lerp(tip, 0.22), 0.045, PLUM, 8);
  } else tip.add(new Vector3(0, 0.11, 0).applyMatrix4(phone));
  phone.setPosition(tip);
  b.add(new BoxGeometry(0.21, 0.36, 0.05), look.case, phone);
  b.add(
    new BoxGeometry(0.17, 0.3, 0.02),
    '#EEF4FC',
    phone.clone().multiply(new Matrix4().makeTranslation(0, 0, -0.03)),
    false,
  );
  return { phone: tip, hand: rHand };
}

/**
 * Influencers posing all round the viewer with selfie sticks and phones, on
 * the carpet or the plaza. On lighter devices they stand still, merged into
 * one mesh: one draw call instead of nine.
 * @param {() => number} random
 * @param {boolean} still
 */
function influencers(random, still) {
  const group = new Group();
  const looks = [
    { x: -0.7, z: 6.5, outfit: BUTTER, hair: INK, stick: true, skirt: false, style: 0 },
    { x: 0.9, z: 7.4, outfit: LILAC_MID, hair: PEACH_MID, stick: false, skirt: true, style: 1 },
    { x: -0.4, z: 3.9, outfit: PAPER, hair: COCOA, stick: true, skirt: false, style: 2 },
    { x: 0.6, z: 18.6, outfit: MINT_MID, hair: ROSE_DEEP, stick: false, skirt: true, style: 0 },
    { x: -0.7, z: 19.6, outfit: ROSE, hair: COCOA, stick: true, skirt: false, style: 1 },
    { x: 9.5, z: 8.5, outfit: SKY_MID, hair: BUTTER_MID, stick: true, skirt: true, style: 2 },
    { x: 14, z: 14.5, outfit: PEACH, hair: INK, stick: false, skirt: false, style: 0 },
    { x: -9, z: 9, outfit: ROSE_MID, hair: '#F1D2B6', stick: true, skirt: true, style: 1 },
    { x: -9.5, z: 18.5, outfit: PAPER, hair: LILAC_DEEP, stick: false, skirt: false, style: 2 },
  ];
  /** @type {{ group: Group, phase: number, base: Vector3, ry: number }[]} */
  const figures = [];
  /** @type {Emitter[]} */
  const emitters = [];
  looks.forEach((look, i) => {
    const b = new Batch();
    const held = figure(b, { ...look, skin: SKIN[(i * 2) % SKIN.length], case: BRIGHTS[(i + 3) % BRIGHTS.length] });
    const tip = held.phone;
    const g = new Group();
    g.userData.held = { ...held, stick: look.stick };
    g.add(b.mesh());
    // On the carpet they stand on its top; elsewhere on the plaza.
    const onCarpet = Math.abs(look.x) < 1.45 && look.z > 3.6 && look.z < KERB_Z - 0.2;
    const base = new Vector3(look.x, onCarpet ? CARPET_TOP : 0, look.z);
    g.position.copy(base);
    // Pose for the viewer, more or less.
    const ry = Math.atan2(EYE.x - look.x, EYE.z - look.z) + (random() - 0.5) * 0.8;
    g.rotation.y = ry;
    group.add(g);
    figures.push({ group: g, phase: random() * 6, base, ry });
    emitters.push(worldPoint(g, tip, 3));
  });
  const m = new Matrix4();
  const flat = new Quaternion();
  const s = new Vector3(0.95, 1, 0.8);
  const at = new Vector3();
  /** Their contact shadows, in the shared instanced blobs. @param {InstancedMesh} blobs @param {number} slot */
  const shadow = (blobs, slot) => {
    figures.forEach((f, i) =>
      blobs.setMatrixAt(slot + i, m.compose(at.set(f.group.position.x, f.base.y + 0.014, f.group.position.z), flat, s)),
    );
    return slot + figures.length;
  };
  if (still) {
    group.updateMatrixWorld(true);
    const merged = figures.map((f) => {
      const mesh = /** @type {Mesh} */ (f.group.children[0]);
      return mesh.geometry.clone().applyMatrix4(f.group.matrixWorld);
    });
    const first = /** @type {Mesh} */ (figures[0].group.children[0]);
    const one = new Mesh(mergeGeometries(merged), first.material);
    const hulls = figures.map((f) => {
      const mesh = /** @type {Mesh} */ (f.group.children[0]);
      return /** @type {BufferGeometry} */ (mesh.userData.hull).clone().applyMatrix4(f.group.matrixWorld);
    });
    one.userData.hull = mergeGeometries(hulls);
    hulls.forEach((g) => g.dispose());
    figures.forEach((f) => /** @type {Mesh} */ (f.group.children[0]).geometry.dispose());
    merged.forEach((g) => g.dispose());
    const frozen = new Group();
    frozen.add(one);
    // The flash emitters stay where they were, fixed to the (now static) poses.
    return {
      group: frozen,
      update: (/** @type {number} */ _t, /** @type {InstancedMesh} */ blobs, /** @type {number} */ slot) =>
        shadow(blobs, slot),
      emitters,
      size: figures.length,
    };
  }
  /** @param {number} t @param {InstancedMesh} blobs @param {number} slot */
  function update(t, blobs, slot) {
    figures.forEach((f) => {
      f.group.rotation.y = f.ry + Math.sin(t * 0.6 + f.phase) * 0.45;
      // A little sway from the hips, feet planted.
      f.group.rotation.z = Math.sin(t * 1.3 + f.phase) * 0.025;
      f.group.updateMatrixWorld();
    });
    return shadow(blobs, slot);
  }
  return { group, update, emitters, size: figures.length };
}

/**
 * A point fixed to a moving object, read in world space.
 * @param {Object3D} owner
 * @param {Vector3} local
 * @param {number} weight how often it flashes relative to a crowd phone
 * @returns {Emitter}
 */
function worldPoint(owner, local, weight) {
  const world = new Vector3();
  return {
    weight,
    get position() {
      return world.copy(local).applyMatrix4(owner.matrixWorld);
    },
  };
}

/**
 * A limo that drives in from the west, waits at the carpet and drives off
 * east. Two of them run half a cycle apart, so one arrives as the other leaves.
 * @param {string} color
 */
function limo(color) {
  const b = new Batch();
  b.box(8.2, 0.9, 2.2, color, 0, 0.85, 0);
  b.box(5.6, 0.75, 2.0, color, -0.4, 1.65, 0);
  b.box(5.4, 0.5, 2.06, DUSK, -0.4, 1.65, 0);
  b.box(8.3, 0.1, 2.24, STONE_TRIM, 0, 0.5, 0);
  b.box(0.12, 0.3, 0.6, BUTTER, 4.12, 0.95, 0.65);
  b.box(0.12, 0.3, 0.6, BUTTER, 4.12, 0.95, -0.65);
  b.box(0.12, 0.25, 0.5, ROSE_MID, -4.12, 0.95, 0.7);
  b.box(0.12, 0.25, 0.5, ROSE_MID, -4.12, 0.95, -0.7);
  for (const x of [-2.9, 2.6]) {
    for (const z of [-1.1, 1.1]) {
      // Wheels on the road: centre at their radius.
      b.add(new CylinderGeometry(0.45, 0.45, 0.3, 16), PLUM, place(x, 0.45, z, 0, Math.PI / 2));
      b.add(new CylinderGeometry(0.2, 0.2, 0.32, 10), LILAC, place(x, 0.45, z, 0, Math.PI / 2), false);
    }
  }
  const group = new Group();
  group.add(b.mesh());
  group.position.set(-120, 0, ROAD_Z);
  /** @param {number} t */
  function update(t) {
    const u = (((t % CYCLE) + CYCLE) % CYCLE) / CYCLE;
    // Arrive (ease out), wait at the carpet, leave (ease in), then out of sight.
    let x;
    if (u < 0.25) x = -100 + 100 * (1 - (1 - u / 0.25) ** 3);
    else if (u < 0.5) x = 0;
    else if (u < 0.75) x = 100 * ((u - 0.5) / 0.25) ** 2.2;
    else x = -120;
    group.position.x = x;
  }
  return { group, update };
}

/**
 * Camera flashes: instanced star bursts at phones and cameras. Each slot fires
 * on its own beat (so the pattern doesn't depend on frame rate), rises over a
 * couple of frames and fades over a few more, and glows instead of popping in and out.
 * @param {Emitter[]} emitters
 * @param {number} slots
 */
function flashBulbs(emitters, slots) {
  const mesh = new InstancedMesh(starShape(0.7, 0.3), glowMaterial(), slots);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.name = 'flashes';
  const flash = new Color('#FFF6E2');
  for (let i = 0; i < slots; i++) mesh.setColorAt(i, flash);
  const pool = emitters.flatMap((e) => Array(e.weight).fill(e));
  const m = new Matrix4();
  const s = new Vector3();
  /**
   * @param {number} t
   * @param {Quaternion} facing the camera's orientation, so bursts face it
   */
  function update(t, facing) {
    let k = 0;
    for (let i = 0; i < slots; i++) {
      const period = 1.4 + hash1(i) * 2.2;
      const beat = t / period + hash1(i + 50);
      const age = (beat - Math.floor(beat)) * period;
      if (age > 0.4 || pool.length === 0) continue;
      const e = pool[Math.floor(hash1(Math.floor(beat) * 31 + i) * pool.length)];
      const envelope = age < 0.05 ? age / 0.05 : Math.exp(-(age - 0.05) * 9);
      const size = envelope * (0.5 + 0.5 * hash1(i + 9));
      m.compose(e.position, facing, s.set(size, size, size));
      mesh.setMatrixAt(k++, m);
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}

/**
 * Little sparkles twinkling round the marquee and over the carpet: four-point
 * stars that swell and fade on their own slow beats, always facing the viewer.
 * @param {number} count
 * @param {() => number} random
 */
function sparkles(count, random) {
  const s = new Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.08 : 0.32;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const mesh = new InstancedMesh(new ShapeGeometry(s), glowMaterial(), count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.name = 'sparkles';
  const tones = [new Color('#FFF4D6'), new Color(PEACH), new Color(LILAC), new Color(SKY)];
  const spots = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, tones[i % tones.length]);
    // Half round the sign, half over the carpet and the plaza, but not right
    // in the viewer's face, where a sparkle would fill the screen.
    const nearSign = i % 2 === 0;
    let at = new Vector3((random() - 0.5) * 16, 8 + random() * 4.5, 0.6 + random() * 1.2);
    for (let tries = 0; !nearSign && tries < 20; tries++) {
      at = new Vector3((random() - 0.5) * 14, 2.6 + random() * 4, 3 + random() * 16);
      if (at.distanceTo(EYE) > 7) break;
    }
    return {
      at,
      period: 1.8 + random() * 2.4,
      phase: random(),
      size: 0.5 + random() * 0.7,
    };
  });
  const m = new Matrix4();
  const v = new Vector3();
  /** @param {number} t @param {Quaternion} facing */
  function update(t, facing) {
    spots.forEach((sp, i) => {
      const u = (t / sp.period + sp.phase) % 1;
      const glow = Math.max(0, Math.sin(u * Math.PI)) ** 3 * sp.size;
      mesh.setMatrixAt(i, m.compose(sp.at, facing, v.set(glow, glow, glow).addScalar(1e-4)));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}

/**
 * Confetti falling all round the viewer. Each piece grows in at the top and
 * shrinks away under the ground, so none of them blink in or out.
 * @param {number} count
 * @param {() => number} random
 */
function confetti(count, random) {
  const TOP = 20;
  const mesh = new InstancedMesh(new PlaneGeometry(0.24, 0.15), new MeshBasicMaterial({ side: DoubleSide }), count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  const bits = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, new Color(BRIGHTS[i % BRIGHTS.length]));
    // Not right in the viewer's face: start at least 2.5 m away.
    const a = random() * Math.PI * 2;
    const r = 2.5 + Math.sqrt(random()) * 16;
    return {
      x: EYE.x + Math.sin(a) * r,
      z: EYE.z + Math.cos(a) * r,
      y0: random() * (TOP + 2),
      speed: 0.7 + random() * 0.9,
      spin: 0.8 + random() * 2,
      phase: random() * 6.3,
    };
  });
  const m = new Matrix4();
  const o = new Object3D();
  /** @param {number} t */
  function update(t) {
    bits.forEach((b, i) => {
      const y = TOP - ((TOP + 2 - b.y0 + t * b.speed) % (TOP + 2));
      const scale = smoothstep(TOP, TOP - 1.5, y) * smoothstep(-1.5, 0.2, y);
      o.position.set(b.x + Math.sin(t * 0.9 + b.phase) * 0.8, y, b.z + Math.cos(t * 0.7 + b.phase) * 0.5);
      o.rotation.set(t * b.spin + b.phase, t * b.spin * 0.7, b.phase);
      o.scale.setScalar(Math.max(scale, 1e-4));
      o.updateMatrix();
      mesh.setMatrixAt(i, m.copy(o.matrix));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}
