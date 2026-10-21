// The premiere night at the Vancouver Art Gallery, in low-poly shapes: the
// neoclassical facade with its dome, a red carpet up the steps between velvet
// ropes, limos pulling up, a crowd of influencers with phones, selfie sticks and
// cameras going off, SANDBOX in marquee bulbs, a projector throwing the event's
// ads onto the gallery wall, searchlights and confetti.
//
// Everything static is merged into one vertex-coloured mesh; the moving parts
// are a handful of meshes and instanced meshes. `update(t)` is a pure function
// of time, so a still frame at a given t always looks the same.
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoBlending,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bulbLayout } from './marquee.js';
import { BLUE, BRIGHTS, GREEN, INK, ORANGE, PINK, PURPLE, RED, YELLOW } from './palette.js';
import { hash1, rng } from './quality.js';

const STONE = '#E9DCC0';
const STONE_SHADE = '#CDBB98';
const PAVING = '#D8C9A8';
const ROAD = '#4A4650';
const CARPET = '#C8201C';
const GOLD = '#D9A520';
const WINDOW = '#FFD75E';
const DOME = '#6FB3A0';
const SKIN = ['#F4C8A0', '#E9B48A', '#C98A5B', '#8D5A3B', '#F1D2B6'];

const ROAD_Z = 18.6;
const CYCLE = 26; // seconds for a limo to pull up, wait and leave

/** @typedef {import('./quality.js').Quality} Quality */

/**
 * Collects static geometry with a baked colour, then merges it into one mesh.
 */
class Batch {
  /** @type {BufferGeometry[]} */
  parts = [];

  /**
   * @param {BufferGeometry} geometry
   * @param {string} color
   * @param {Matrix4 | null} [matrix]
   */
  add(geometry, color, matrix = null) {
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
    geometry.dispose();
  }

  /** @param {number} w @param {number} h @param {number} d @param {string} color @param {number} x @param {number} y @param {number} z @param {number} [ry] */
  box(w, h, d, color, x, y, z, ry = 0) {
    this.add(new BoxGeometry(w, h, d), color, place(x, y, z, ry));
  }

  /** @param {number} rt @param {number} rb @param {number} h @param {number} seg @param {string} color @param {number} x @param {number} y @param {number} z */
  cylinder(rt, rb, h, seg, color, x, y, z) {
    this.add(new CylinderGeometry(rt, rb, h, seg), color, place(x, y, z));
  }

  /** @param {boolean} lit */
  mesh(lit = true) {
    const geometry = mergeGeometries(this.parts);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    const material = lit
      ? new MeshLambertMaterial({ vertexColors: true, flatShading: true })
      : new MeshBasicMaterial({ vertexColors: true });
    return new Mesh(geometry, material);
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

/**
 * Builds the scene for a quality level.
 * @param {Quality} quality
 * @param {{ adTexture?: import('three').Texture | null }} [options]
 */
export function buildScene(quality, { adTexture = null } = {}) {
  const random = rng(2027);
  const scene = new Scene();
  scene.background = new Color('#1E2A66');
  scene.fog = new Fog('#3B2F7A', 95, 170);

  const camera = new PerspectiveCamera(38, 16 / 9, 0.5, 260);
  const target = new Vector3(0, 7.2, -2);

  scene.add(new HemisphereLight('#FFF1D6', '#5B4A8A', 2.1));
  const sun = new DirectionalLight('#FFE2B0', 1.6);
  sun.position.set(-14, 26, 22);
  scene.add(sun);

  scene.add(sky());
  scene.add(gallery());
  scene.add(plaza(random));

  const marquee = marqueeSign();
  scene.add(marquee.group);

  const ad = adWall(adTexture);
  scene.add(ad.group);

  const lights = searchlights(quality.searchlights);
  scene.add(lights.group);

  const people = crowd(quality.crowd, random);
  scene.add(people.group);

  const stars = influencers(random);
  scene.add(stars.group);

  const limos = [limo(PINK), limo('#FFFFFF')];
  limos.forEach((l) => scene.add(l.group));

  const flashes = flashBulbs([...people.emitters, ...stars.emitters]);
  scene.add(flashes.mesh);

  const paper = confetti(quality.confetti, random);
  scene.add(paper.mesh);

  /**
   * Frames the camera for an aspect ratio, widening the lens on narrow screens
   * so the portico and carpet still fit.
   * @param {number} aspect
   */
  function setAspect(aspect) {
    camera.aspect = aspect;
    const minHalfWidth = 13.5;
    const halfWidth = Math.tan((38 * Math.PI) / 360) * 46 * aspect;
    camera.fov = halfWidth < minHalfWidth ? (Math.atan(minHalfWidth / (46 * aspect)) * 360) / Math.PI : 38;
    camera.updateProjectionMatrix();
  }

  const shift = { x: 0, y: 0 };
  /**
   * Moves the scene within the frame, as fractions of the width and height,
   * so the hero text doesn't cover the gallery: right of the card on wide
   * screens, above it on phones.
   * @param {number} x
   * @param {number} y
   */
  function setShift(x, y) {
    shift.x = x;
    shift.y = y;
  }

  /** @param {number} t seconds */
  function update(t) {
    // A slow swing around the plaza.
    const swing = Math.sin((t / 70) * Math.PI * 2) * 0.42 + 0.08;
    const radius = 46;
    camera.position.set(Math.sin(swing) * radius, 9.5 + Math.sin(t / 23) * 0.6, Math.cos(swing) * radius - 2);
    camera.lookAt(target);
    const halfH = Math.tan((camera.fov * Math.PI) / 360);
    camera.rotateY(Math.atan(shift.x * 2 * halfH * camera.aspect));
    camera.rotateX(-Math.atan(shift.y * 2 * halfH));

    marquee.update(t);
    ad.update(t);
    lights.update(t);
    people.update(t);
    stars.update(t);
    limos.forEach((l, i) => l.update(t + i * (CYCLE / 2)));
    flashes.update(t, camera.quaternion);
    paper.update(t);
  }

  setAspect(16 / 9);
  update(0);

  return { scene, camera, update, setAspect, setShift };
}

function sky() {
  const geometry = new SphereGeometry(200, 24, 12);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new Color('#1B2560') },
      mid: { value: new Color('#5A3C9E') },
      low: { value: new Color('#F08A4B') },
    },
    vertexShader: /* glsl */ `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      varying float vY;
      void main() {
        vec3 c = mix(low, mid, smoothstep(-0.02, 0.16, vY));
        c = mix(c, top, smoothstep(0.16, 0.5, vY));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new Mesh(geometry, material);
  dome.renderOrder = -1;

  // A crayon moon, stars and the North Shore mountains.
  const b = new Batch();
  b.add(new CircleShape(5.5).geometry(), '#FFF3C4', place(-60, 62, -150));
  const r = rng(7);
  for (let i = 0; i < 26; i++) {
    const a = -1.2 + r() * 2.4;
    const h = 0.32 + r() * 0.55;
    const d = 170;
    const m = place(Math.sin(a) * d, Math.tan(h) * d * 0.55 + 18, -Math.cos(a) * d * 0.85, -a);
    b.add(starShape(1.2 + r() * 1.4, 0.45), i % 3 ? '#FFF3C4' : YELLOW, m);
  }
  const lit = b.mesh(false);
  lit.renderOrder = -1;

  const hills = new Batch();
  const peaks = [
    [-120, 34, 50],
    [-80, 46, 46],
    [-40, 30, 40],
    [-5, 40, 52],
    [40, 34, 44],
    [80, 48, 50],
    [125, 36, 48],
  ];
  peaks.forEach(([x, h, w], i) => {
    hills.add(new CylinderGeometry(0, w, h, 5), i % 2 ? '#3E4F86' : '#46598F', place(x, h / 2 - 2, -150, i));
    hills.add(new CylinderGeometry(0, w * 0.28, h * 0.28, 5), '#F4F1FF', place(x, h - h * 0.14 - 2, -150, i));
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

function gallery() {
  const b = new Batch();
  // Podium and main block: front face at z = -6.
  b.box(46, 1.2, 15, STONE_SHADE, 0, 0.6, -13);
  b.box(42, 8.4, 13, STONE, 0, 5.4, -12.5);
  b.box(43, 0.7, 13.8, '#F3EBD8', 0, 9.95, -12.5);
  b.box(41, 0.9, 12, STONE_SHADE, 0, 10.75, -12.5);
  // Side pavilions step forward.
  for (const sx of [-1, 1]) {
    b.box(9, 9.4, 14, STONE, sx * 17, 5.9, -12.4);
    b.box(9.8, 0.7, 14.6, '#F3EBD8', sx * 17, 10.9, -12.4);
    b.box(9, 0.5, 0.4, STONE_SHADE, sx * 17, 1.6, -5.3);
    // Lit windows, two floors, on the main block and the pavilion.
    for (const wx of [9, 11.4]) {
      for (const wy of [3.6, 7.2]) b.box(1.1, 2.1, 0.3, WINDOW, sx * wx, wy, -5.95);
    }
    for (const wy of [3.6, 7.6]) b.box(1.2, 2.3, 0.3, WINDOW, sx * 19.6, wy, -5.35);
  }
  // Portico floor and steps (8 steps up to y = 2.2).
  b.box(21, 2.2, 5.6, STONE_SHADE, 0, 1.1, -3.6);
  for (let i = 0; i < 8; i++) {
    const h = 2.2 - i * 0.275;
    b.box(22 - i * 0.2, h, 0.6, i % 2 ? STONE : '#F1E6CF', 0, h / 2, -0.55 + i * 0.55);
  }
  // Six Ionic-ish columns.
  for (const x of [-8.4, -5, -1.7, 1.7, 5, 8.4]) {
    b.box(1.7, 0.5, 1.7, '#F3EBD8', x, 2.45, -2.4);
    b.cylinder(0.62, 0.7, 6.9, 10, '#F7F0E0', x, 6.15, -2.4);
    b.box(1.9, 0.45, 1.5, '#F3EBD8', x, 9.8, -2.4);
    b.cylinder(0.32, 0.32, 1.9, 8, '#F3EBD8', x, 9.75, -1.75);
  }
  // Entablature and pediment.
  b.box(19.6, 1.3, 5.4, '#F3EBD8', 0, 10.65, -3.9);
  const pediment = new Shape();
  pediment.moveTo(-10.2, 0);
  pediment.lineTo(10.2, 0);
  pediment.lineTo(0, 3.3);
  pediment.lineTo(-10.2, 0);
  b.add(new ExtrudeGeometry(pediment, { depth: 5.6, bevelEnabled: false }), STONE, place(0, 11.3, -6.6));
  const tympanum = new Shape();
  tympanum.moveTo(-8.4, 0);
  tympanum.lineTo(8.4, 0);
  tympanum.lineTo(0, 2.6);
  tympanum.lineTo(-8.4, 0);
  b.add(new ShapeGeometry(tympanum), STONE_SHADE, place(0, 11.65, -0.98));
  // Doorway, glowing.
  b.box(3.4, 5, 0.3, WINDOW, 0, 4.7, -6.05);
  b.box(4.2, 0.5, 0.5, STONE_SHADE, 0, 7.4, -6);
  // Drum, dome and lantern.
  b.cylinder(4.6, 4.8, 2.6, 16, STONE, 0, 12.4, -13);
  b.cylinder(4.9, 4.9, 0.5, 16, '#F3EBD8', 0, 13.9, -13);
  b.add(new SphereGeometry(4.6, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), DOME, place(0, 14.1, -13));
  b.cylinder(0.9, 1.1, 1.4, 8, '#F3EBD8', 0, 19.3, -13);
  b.add(new IcosahedronGeometry(0.55, 0), GOLD, place(0, 20.4, -13));
  // Bunting between the columns.
  for (let i = 0; i < 26; i++) {
    const x = -9.6 + i * 0.77;
    const sag = Math.sin(((x + 9.6) / 3.36) * Math.PI) ** 2 * 0.5;
    b.add(triangle(0.5, 0.75), BRIGHTS[i % BRIGHTS.length], place(x, 9.1 - Math.abs(sag), -1.2));
  }
  // Banners on the pavilions.
  b.box(2.6, 6.4, 0.2, RED, -17, 6.2, -5.15);
  b.box(2.6, 6.4, 0.2, BLUE, 17, 6.2, -5.15);
  b.box(2.2, 0.5, 0.25, YELLOW, -17, 6.2, -5.0);
  b.box(2.2, 0.5, 0.25, YELLOW, 17, 6.2, -5.0);
  return b.mesh();
}

/** @param {number} w @param {number} h downward-pointing pennant */
function triangle(w, h) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, -h);
  s.lineTo(-w / 2, 0);
  return new ShapeGeometry(s);
}

/** @param {() => number} random */
function plaza(random) {
  const b = new Batch();
  b.box(140, 0.2, 60, PAVING, 0, -0.1, -2);
  // Paving lines.
  for (let z = -2; z < 16; z += 3) b.box(60, 0.02, 0.08, '#C4B38F', 0, 0.01, z);
  // Road with a dashed centre line, kerbs and the far pavement.
  b.box(140, 0.2, 7.6, ROAD, 0, -0.08, ROAD_Z + 1.9);
  b.box(140, 0.35, 0.4, '#BDB4A6', 0, 0.05, ROAD_Z - 1.9);
  for (let x = -60; x < 60; x += 4.4) b.box(2.2, 0.03, 0.18, YELLOW, x, 0.03, ROAD_Z + 1.9);
  b.box(140, 0.2, 40, '#D9CDB0', 0, -0.06, ROAD_Z + 25);

  // Red carpet from the kerb, up the steps, to the door.
  b.box(3, 0.06, ROAD_Z - 2.1 - 3.6, CARPET, 0, 0.03, (ROAD_Z - 2.1 + 3.6) / 2);
  for (let i = 0; i < 8; i++) {
    const h = 2.2 - i * 0.275;
    b.box(3, 0.05, 0.6, CARPET, 0, h + 0.02, -0.55 + i * 0.55);
  }
  b.box(3, 0.05, 5.6, CARPET, 0, 2.23, -3.6);

  // Brass stanchions with velvet ropes on both sides of the carpet.
  for (const sx of [-1, 1]) {
    /** @type {Vector3[]} */
    const tops = [];
    for (let z = 3.6; z <= ROAD_Z - 2.5; z += 2.2) {
      const x = sx * 2.3;
      b.cylinder(0.28, 0.36, 0.12, 8, GOLD, x, 0.06, z);
      b.cylinder(0.07, 0.07, 1.2, 6, GOLD, x, 0.66, z);
      b.add(new IcosahedronGeometry(0.15, 0), GOLD, place(x, 1.3, z));
      tops.push(new Vector3(x, 1.22, z));
    }
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i];
      const c = tops[i + 1];
      const mid = a.clone().lerp(c, 0.5);
      mid.y -= 0.32;
      const curve = new CatmullRomCurve3([a, mid, c]);
      b.add(new TubeGeometry(curve, 8, 0.07, 5, false), '#8C1730');
    }
  }

  // Projector on a tripod, aimed at the left pavilion.
  const px = -8.8;
  const pz = 12.2;
  for (const a of [0, 2.1, 4.2]) {
    const leg = new CylinderGeometry(0.06, 0.06, 3.1, 5);
    const m = new Matrix4().makeRotationFromEuler(
      new Object3D().rotation.set(0.32 * Math.cos(a), 0, 0.32 * Math.sin(a)),
    );
    m.setPosition(px + Math.sin(a) * 0.45, 1.45, pz + Math.cos(a) * 0.45);
    b.add(leg, INK, m);
  }
  b.box(1.4, 0.9, 1.8, PURPLE, px, 3.25, pz, 0.62);
  b.add(new CylinderGeometry(0.34, 0.4, 0.5, 10), INK, place(px - 0.62, 3.3, pz - 0.98, 0.62, Math.PI / 2));
  b.box(0.5, 0.3, 0.5, YELLOW, px + 0.2, 3.85, pz + 0.3, 0.62);

  // Planters with palms on the plaza corners.
  for (const [x, z] of [
    [-13.5, 2.5],
    [13.5, 2.5],
    [-24, 8],
    [24, 8],
  ]) {
    b.box(1.6, 0.9, 1.6, STONE_SHADE, x, 0.45, z);
    b.cylinder(0.16, 0.22, 3.6, 6, '#8A5A2B', x, 2.6, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + random();
      b.add(
        new BoxGeometry(2.4, 0.08, 0.55),
        GREEN,
        place(x + Math.cos(a) * 1.0, 4.35, z + Math.sin(a) * 1.0, -a, 0, -0.45),
      );
    }
  }

  // The gallery's lawns, with trees, on either side of the plaza.
  for (const sx of [-1, 1]) {
    b.box(46, 0.12, 30, '#4A9440', sx * 46, 0.02, 0);
    for (let i = 0; i < 9; i++) {
      const x = sx * (27 + random() * 36);
      const z = -12 + random() * 26;
      const h = 2.6 + random() * 1.6;
      b.cylinder(0.25, 0.35, h, 6, '#8A5A2B', x, h / 2, z);
      b.add(
        new IcosahedronGeometry(1.6 + random() * 0.9, 0),
        i % 3 ? '#2F8F45' : GREEN,
        place(x, h + 1.1, z, random() * 3),
      );
    }
  }

  // City towers on both sides, behind the gallery.
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (30 + random() * 30);
    const z = -26 - random() * 28;
    const h = 14 + random() * 30;
    const w = 5 + random() * 6;
    b.box(w, h, w, i % 3 ? '#3A3F7A' : '#4B3F86', x, h / 2, z);
    for (let y = 3; y < h - 2; y += 3.2) {
      for (let k = -1; k <= 1; k++)
        if (random() > 0.4) b.box(0.8, 1.1, 0.2, WINDOW, x + k * (w / 3.4), y, z + w / 2 + 0.05);
    }
  }
  return b.mesh();
}

/**
 * An unlit material that marks its pixels as glowing: it writes alpha 0 into
 * the render target, which the crayon pass reads as "light source" (full
 * colour, no ink, a hatched halo around it). Works on instanced meshes.
 */
export function glowMaterial() {
  return new ShaderMaterial({
    blending: NoBlending,
    vertexShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vColor = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 0.0); }`,
  });
}

/**
 * SANDBOX in marquee lights on an ink-black board: solid, touching letter
 * pixels that glow warm yellow, with bulbs on top that twinkle, and a chaser
 * border. The letters themselves never dim, so the word always reads.
 */
function marqueeSign() {
  const group = new Group();
  const b = new Batch();
  const W = 18.4;
  const H = 4.6;
  const y = 16.2;
  const z = -7.2;
  b.box(W, H, 0.5, INK, 0, y, z);
  b.box(W + 0.7, 0.4, 0.7, GOLD, 0, y + H / 2, z);
  b.box(W + 0.7, 0.4, 0.7, GOLD, 0, y - H / 2, z);
  for (const sx of [-1, 1]) {
    b.box(0.4, H + 0.4, 0.7, GOLD, (sx * (W + 0.3)) / 2, y, z);
    b.box(0.35, 4, 0.35, INK, sx * (W / 2 - 1.5), y - H / 2 - 2, z - 0.2);
  }
  group.add(b.mesh());

  const spacing = 0.42;
  const pixels = bulbLayout('SANDBOX').map((p) => ({
    x: p.x * spacing,
    y: y + p.y * spacing,
    column: Math.round(p.x),
  }));
  const letters = new InstancedMesh(new BoxGeometry(spacing, spacing, 0.12), glowMaterial(), pixels.length);
  const bulbs = new InstancedMesh(new IcosahedronGeometry(0.12, 0), glowMaterial(), pixels.length);
  const m = new Matrix4();
  const letterColor = new Color('#FFC93A');
  pixels.forEach((p, i) => {
    letters.setMatrixAt(i, m.makeTranslation(p.x, p.y, z + 0.3));
    letters.setColorAt(i, letterColor);
    bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, z + 0.42));
  });

  // Chaser bulbs around the border.
  /** @type {{ x: number, y: number, phase: number }[]} */
  const border = [];
  const nx = 32;
  const ny = 7;
  for (let i = 0; i < nx; i++) {
    const x = -W / 2 + 0.4 + (i / (nx - 1)) * (W - 0.8);
    border.push({ x, y: y + H / 2 - 0.45, phase: i }, { x, y: y - H / 2 + 0.45, phase: nx - i });
  }
  for (let i = 1; i < ny - 1; i++) {
    const yy = y - H / 2 + 0.45 + (i / (ny - 1)) * (H - 0.9);
    border.push({ x: -W / 2 + 0.4, y: yy, phase: i }, { x: W / 2 - 0.4, y: yy, phase: i + 3 });
  }
  const chasers = new InstancedMesh(new IcosahedronGeometry(0.17, 0), glowMaterial(), border.length);
  border.forEach((p, i) => chasers.setMatrixAt(i, m.makeTranslation(p.x, p.y, z + 0.3)));
  [bulbs, chasers].forEach((mesh) => {
    mesh.setColorAt(0, letterColor);
    mesh.instanceColor?.setUsage(DynamicDrawUsage);
  });
  letters.name = 'marquee-letters';
  bulbs.name = 'marquee-bulbs';
  chasers.name = 'marquee-chasers';
  group.add(letters, bulbs, chasers);

  const white = new Color('#FFFDF0');
  const warm = new Color('#FFE38A');
  const amber = new Color('#E39A2A');
  /** @param {number} t */
  function update(t) {
    const step = Math.floor(t * 6);
    // A slow sparkle sweeping across the letters, and a chase around the border.
    pixels.forEach((p, i) =>
      bulbs.setColorAt(i, (p.column + step) % 5 === 0 || (i * 7 + step) % 23 === 0 ? white : warm),
    );
    border.forEach((p, i) => chasers.setColorAt(i, (p.phase + step) % 3 === 0 ? white : amber));
    [bulbs, chasers].forEach((mesh) => {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
  return { group, update };
}

/**
 * The ad wall on the left pavilion and the projector's beam. With a texture,
 * the panels cycle through the site's own ads; without one, through
 * procedural colour panels.
 * @param {import('three').Texture | null} texture
 */
function adWall(texture) {
  const group = new Group();
  const w = 7.2;
  const h = 4.6;
  const center = new Vector3(-17, 6, -5.05);
  const material = new ShaderMaterial({
    uniforms: {
      tAds: { value: texture },
      uHasAds: { value: texture ? 1 : 0 },
      uTime: { value: 0 },
      uColors: { value: [RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE].map((c) => new Color(c)) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tAds; uniform float uHasAds; uniform float uTime; uniform vec3 uColors[6];
      varying vec2 vUv;
      void main() {
        float slide = floor(uTime / 2.6);
        float local = fract(uTime / 2.6);
        float idx = mod(slide, 4.0);
        vec2 cell = vec2(mod(idx, 2.0), floor(idx / 2.0));
        vec3 ad = texture2D(tAds, (vUv + cell) * 0.5).rgb;
        // Procedural panels: a colour field with a bouncing sun and stripes.
        vec3 a = uColors[int(mod(slide, 6.0))];
        vec3 b = uColors[int(mod(slide + 2.0, 6.0))];
        float stripes = step(0.5, fract((vUv.x + vUv.y) * 4.0 - uTime * 0.4));
        float sun = step(length(vUv - vec2(0.5, 0.45 + 0.08 * sin(uTime * 3.0))), 0.22);
        vec3 panel = mix(mix(a, a * 0.8, stripes), b, sun);
        vec3 c = mix(panel, ad, uHasAds);
        // A wipe between slides and a little projector flicker.
        c = mix(c, vec3(1.0), step(vUv.x, 1.0 - local * 8.0) * step(local, 0.12) * 0.6);
        c *= 0.92 + 0.08 * sin(uTime * 40.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const screen = new Mesh(new PlaneGeometry(w, h), material);
  screen.position.copy(center);
  group.add(screen);

  // Beam from the projector lens to the four corners.
  const lens = new Vector3(-9.45, 3.3, 11.4);
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => new Vector3(center.x + x, center.y + y, center.z + 0.05));
  const pos = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const c = corners[(i + 1) % 4];
    pos.push(lens.x, lens.y, lens.z, a.x, a.y, a.z, c.x, c.y, c.z);
  }
  const beamGeometry = new BufferGeometry();
  beamGeometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const beamMaterial = new MeshBasicMaterial({
    color: '#FFF1B8',
    transparent: true,
    opacity: 0.16,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  group.add(new Mesh(beamGeometry, beamMaterial));

  /** @param {number} t */
  function update(t) {
    material.uniforms.uTime.value = t;
    beamMaterial.opacity = 0.15 + 0.03 * Math.sin(t * 9);
  }
  return { group, update };
}

/** @param {number} count */
function searchlights(count) {
  const group = new Group();
  const spots = [
    [-12, -24, 0],
    [12, -24, 1.7],
    [-28, -10, 3.1],
    [28, -10, 4.4],
  ].slice(0, count);
  const material = new MeshBasicMaterial({
    color: '#FFF4C9',
    transparent: true,
    opacity: 0.1,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const geometry = new CylinderGeometry(3.4, 0.3, 90, 14, 1, true);
  geometry.translate(0, 45, 0);
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
      pivot.rotateY(t * 0.35 + phase);
      pivot.rotateZ(0.34 + 0.12 * Math.sin(t * 0.5 + phase));
    }
  }
  return { group, update };
}

/**
 * The crowd behind the ropes: instanced bodies, heads, raised arms and phones.
 * @param {number} count
 * @param {() => number} random
 */
function crowd(count, random) {
  const group = new Group();
  /** @type {{ x: number, z: number, h: number, phase: number, phone: boolean, arms: boolean, ry: number }[]} */
  const folks = [];
  let guard = 0;
  while (folks.length < count && guard++ < count * 20) {
    const side = random() > 0.5 ? 1 : -1;
    const x = side * (3.2 + random() * 15);
    const z = 1.5 + random() * (ROAD_Z - 4.2);
    // Keep clear of the projector and the planters.
    if (Math.hypot(x + 8.8, z - 12.2) < 2) continue;
    if (Math.hypot(Math.abs(x) - 13.5, z - 2.5) < 1.5) continue;
    if (folks.some((f) => Math.hypot(f.x - x, f.z - z) < 0.75)) continue;
    const front = Math.abs(x) < 4.6;
    folks.push({
      x,
      z,
      h: 0.85 + random() * 0.3,
      phase: random() * Math.PI * 2,
      phone: front || random() > 0.55,
      arms: random() > 0.6,
      // Face the carpet, roughly.
      ry: Math.atan2(-x, 2) + (random() - 0.5) * 0.6,
    });
  }
  const n = folks.length;
  const lambert = new MeshLambertMaterial({ flatShading: true });
  const body = new InstancedMesh(new CylinderGeometry(0.26, 0.4, 1.3, 6).translate(0, 0.65, 0), lambert, n);
  const head = new InstancedMesh(new IcosahedronGeometry(0.27, 0), lambert, n);
  const armsGeometry = mergeGeometries([
    new BoxGeometry(0.12, 0.75, 0.12).translate(0, 0.35, 0).rotateZ(0.5),
    new BoxGeometry(0.12, 0.75, 0.12).translate(0, 0.35, 0).rotateZ(-0.5),
  ]);
  const arms = new InstancedMesh(armsGeometry, lambert, n);
  const phoneGeometry = new BoxGeometry(0.26, 0.42, 0.06);
  const phones = new InstancedMesh(phoneGeometry, new MeshBasicMaterial({ color: '#BFE3FF' }), n);
  const skin = SKIN.map((c) => new Color(c));
  folks.forEach((f, i) => {
    body.setColorAt(i, new Color(BRIGHTS[Math.floor(random() * BRIGHTS.length)]));
    head.setColorAt(i, skin[i % skin.length]);
    arms.setColorAt(i, skin[i % skin.length]);
  });
  [body, head, arms, phones].forEach((m) => {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    group.add(m);
  });

  /** Where phones flash, as live positions. */
  const emitters = folks.filter((f) => f.phone).map((f) => ({ position: new Vector3(f.x, 2, f.z), weight: 1 }));
  const phoneOwners = folks.filter((f) => f.phone);

  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const up = new Vector3(0, 1, 0);
  /** @param {number} t */
  function update(t) {
    let k = 0;
    folks.forEach((f, i) => {
      const hop = Math.max(0, Math.sin(t * 3.2 + f.phase)) * 0.22 * (f.arms ? 1 : 0.4);
      q.setFromAxisAngle(up, f.ry + Math.sin(t * 0.8 + f.phase) * 0.15);
      s.set(f.h, f.h, f.h);
      body.setMatrixAt(i, m.compose(p.set(f.x, hop, f.z), q, s));
      head.setMatrixAt(i, m.compose(p.set(f.x, hop + 1.55 * f.h, f.z), q, s));
      const armsUp = f.arms ? 1 : 0.0001;
      arms.setMatrixAt(i, m.compose(p.set(f.x, hop + 1.15 * f.h, f.z), q, s.set(f.h, f.h * armsUp, f.h)));
      if (f.phone) {
        const ph = phoneOwners.indexOf(f);
        const lift = 1.9 + 0.25 * Math.sin(t * 1.3 + f.phase);
        p.set(f.x + Math.sin(f.ry) * 0.35, hop + lift * f.h, f.z + Math.cos(f.ry) * 0.35);
        phones.setMatrixAt(k++, m.compose(p, q, s.set(1, 1, 1)));
        emitters[ph].position.copy(p);
      }
    });
    phones.count = k;
    [body, head, arms, phones].forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
  }
  return { group, update, emitters };
}

/**
 * A few influencers posing on the carpet with selfie sticks and phones.
 * @param {() => number} random
 */
function influencers(random) {
  const group = new Group();
  const looks = [
    { x: -0.7, z: 8.5, outfit: YELLOW, hair: INK, stick: true },
    { x: 0.8, z: 6.2, outfit: PURPLE, hair: ORANGE, stick: false },
    { x: -0.4, z: 3.6, outfit: '#FFFFFF', hair: '#6B3A1E', stick: true },
    { x: 0.6, z: 11.6, outfit: GREEN, hair: PINK, stick: false },
  ];
  /** @type {{ group: Group, phase: number, base: Vector3 }[]} */
  const figures = [];
  /** @type {{ position: Vector3, weight: number }[]} */
  const emitters = [];
  looks.forEach((look, i) => {
    const b = new Batch();
    const skin = SKIN[(i * 2) % SKIN.length];
    b.box(0.22, 1.0, 0.24, INK, -0.17, 0.5, 0);
    b.box(0.22, 1.0, 0.24, INK, 0.17, 0.5, 0);
    b.cylinder(0.3, 0.55, 1.25, 7, look.outfit, 0, 1.6, 0);
    b.add(new IcosahedronGeometry(0.32, 1), skin, place(0, 2.6, 0));
    b.add(new SphereGeometry(0.36, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), look.hair, place(0, 2.66, -0.03, 0, -0.2));
    b.add(new IcosahedronGeometry(0.06, 0), INK, place(-0.12, 2.65, 0.29));
    b.add(new IcosahedronGeometry(0.06, 0), INK, place(0.12, 2.65, 0.29));
    // Left arm on hip, right arm up holding the phone (or the selfie stick).
    b.add(new BoxGeometry(0.14, 0.75, 0.14), skin, place(-0.45, 1.75, 0, 0, 0, -0.6));
    b.add(new BoxGeometry(0.14, 0.8, 0.14), skin, place(0.48, 2.25, 0.1, 0, -0.4, 0.5));
    const tip = look.stick ? new Vector3(1.4, 3.9, 0.9) : new Vector3(0.66, 2.75, 0.45);
    if (look.stick) {
      const stick = new CylinderGeometry(0.035, 0.035, 2.1, 5);
      const dir = tip
        .clone()
        .sub(new Vector3(0.62, 2.6, 0.2))
        .normalize();
      const mm = new Matrix4().makeRotationFromQuaternion(
        new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir),
      );
      mm.setPosition(new Vector3(0.62, 2.6, 0.2).add(tip).multiplyScalar(0.5));
      b.add(stick, INK, mm);
    }
    b.box(0.32, 0.52, 0.07, '#BFE3FF', tip.x, tip.y, tip.z, -0.6);
    const mesh = b.mesh();
    const g = new Group();
    g.add(mesh);
    const base = new Vector3(look.x, 0.03, look.z);
    g.position.copy(base);
    g.rotation.y = (random() - 0.5) * 0.8;
    group.add(g);
    figures.push({ group: g, phase: random() * 6, base });
    emitters.push(worldPoint(g, tip, 3));
  });
  /** @param {number} t */
  function update(t) {
    figures.forEach((f) => {
      f.group.rotation.y = Math.sin(t * 0.6 + f.phase) * 0.5;
      f.group.position.y = f.base.y + Math.abs(Math.sin(t * 2 + f.phase)) * 0.06;
      f.group.updateMatrixWorld();
    });
  }
  return { group, update, emitters };
}

/**
 * A point fixed to a moving object, read in world space.
 * @param {Object3D} owner
 * @param {Vector3} local
 * @param {number} weight how often it flashes relative to a crowd phone
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
 * A limo that drives in from the left, waits at the carpet and drives off.
 * Two of them run half a cycle apart, so one arrives as the other leaves.
 * @param {string} color
 */
function limo(color) {
  const b = new Batch();
  b.box(8.2, 0.9, 2.2, color, 0, 0.85, 0);
  b.box(5.6, 0.75, 2.0, color, -0.4, 1.65, 0);
  b.box(5.4, 0.5, 2.05, '#2B2F5E', -0.4, 1.65, 0);
  b.box(0.12, 0.3, 0.6, YELLOW, 4.1, 0.95, 0.65);
  b.box(0.12, 0.3, 0.6, YELLOW, 4.1, 0.95, -0.65);
  b.box(0.12, 0.25, 0.5, RED, -4.1, 0.95, 0.7);
  b.box(0.12, 0.25, 0.5, RED, -4.1, 0.95, -0.7);
  for (const x of [-2.9, 2.6]) {
    for (const z of [-1.1, 1.1])
      b.add(new CylinderGeometry(0.45, 0.45, 0.3, 10), INK, place(x, 0.45, z, 0, Math.PI / 2));
  }
  const group = new Group();
  group.add(b.mesh());
  group.position.set(-80, 0, ROAD_Z);
  /** @param {number} t */
  function update(t) {
    const u = (((t % CYCLE) + CYCLE) % CYCLE) / CYCLE;
    // Arrive (ease out), wait at the carpet, leave (ease in), then out of sight.
    let x;
    if (u < 0.25) x = -60 + 60 * (1 - (1 - u / 0.25) ** 3);
    else if (u < 0.5) x = 0;
    else if (u < 0.75) x = 60 * ((u - 0.5) / 0.25) ** 2.2;
    else x = -80;
    group.position.x = x;
  }
  return { group, update };
}

/**
 * Camera flashes: instanced star bursts that pop at phones and cameras.
 * Each slot fires on its own beat, so the pattern doesn't depend on frame rate.
 * @param {{ position: Vector3, weight: number }[]} emitters
 */
function flashBulbs(emitters) {
  const slots = 26;
  const mesh = new InstancedMesh(
    starShape(0.9, 0.3),
    new MeshBasicMaterial({ color: '#FFFBE0', fog: false, side: DoubleSide }),
    slots,
  );
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
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
      const period = 0.7 + hash1(i) * 1.6;
      const beat = t / period + hash1(i + 50);
      const age = beat - Math.floor(beat);
      if (age > 0.14 || pool.length === 0) continue;
      const e = pool[Math.floor(hash1(Math.floor(beat) * 31 + i) * pool.length)];
      const size = Math.sin((age / 0.14) * Math.PI) * (0.6 + hash1(i + 9));
      m.compose(e.position, facing, s.set(size, size, size));
      mesh.setMatrixAt(k++, m);
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}

/**
 * @param {number} count
 * @param {() => number} random
 */
function confetti(count, random) {
  const mesh = new InstancedMesh(new PlaneGeometry(0.22, 0.13), new MeshBasicMaterial({ side: DoubleSide }), count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  const bits = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, new Color(BRIGHTS[i % BRIGHTS.length]));
    return {
      x: (random() - 0.5) * 36,
      z: -4 + random() * 22,
      y0: random() * 22,
      speed: 0.8 + random() * 1.1,
      spin: 1 + random() * 3,
      phase: random() * 6.3,
    };
  });
  const m = new Matrix4();
  const o = new Object3D();
  /** @param {number} t */
  function update(t) {
    bits.forEach((b, i) => {
      const y = 22 - ((22 - b.y0 + t * b.speed) % 22);
      o.position.set(b.x + Math.sin(t * 0.9 + b.phase) * 0.8, y, b.z + Math.cos(t * 0.7 + b.phase) * 0.5);
      o.rotation.set(t * b.spin + b.phase, t * b.spin * 0.7, b.phase);
      o.updateMatrix();
      mesh.setMatrixAt(i, m.copy(o.matrix));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}
