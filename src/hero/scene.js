// Premiere night at the Vancouver Art Gallery, in low-poly shapes, seen from
// the middle of it. The camera stands on the red carpet at eye height and
// turns a full circle, forever:
//
//   north  the gallery's neoclassical facade, steps, dome and the SANDBOX
//          marquee over the portico
//   east   the step-and-repeat photo wall, the projector tower beaming the
//          event's ads onto the big screen, a food truck
//   south  a balloon arch where the carpet meets the kerb, paparazzi behind
//          the ropes, limos pulling up, and the shops and hotel across the street
//   west   Robson Square's terraces and fountain, and activation tents
//
// with a crowd, influencers, phones and flashes all round, a skyline, the
// North Shore mountains, searchlights and confetti overhead.
//
// Everything static is merged into one vertex-coloured mesh; the moving parts
// are a handful of meshes and instanced meshes. `update(t)` is a pure function
// of time, so a still frame at a given t always looks the same, and nothing
// in it switches on or off from one frame to the next: lights fade, flashes
// rise and fall over several frames, confetti grows in and out of sight.
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
  OneFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SrcAlphaFactor,
  TubeGeometry,
  Vector3,
  ZeroFactor,
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
const LEAF = '#2F8F45';
const SKIN = ['#F4C8A0', '#E9B48A', '#C98A5B', '#8D5A3B', '#F1D2B6'];

/** The street (Georgia St) runs east-west along this line. */
const ROAD_Z = 23;
/** Where the carpet meets the kerb. */
const KERB_Z = ROAD_Z - 1.9;
/** The viewer: on the red carpet, at eye height, between the street and the steps. */
export const EYE = new Vector3(0, 2.4, 13);
/** The projector tower's foot, and the centre of the big screen it beams at. */
const PROJECTOR = new Vector3(15, 0, 0.5);
const SCREEN = new Vector3(25.05, 7.4, 11);
/** Seconds per full turn of the camera. */
export const REVOLUTION = 75;
/** The moment drawn for reduced motion and the posters: facing the gallery, a limo at the kerb. */
export const STILL_T = 11.2;
const CYCLE = 26; // seconds for a limo to pull up, wait and leave

/**
 * Additive light (searchlight and projector beams) that leaves the render
 * target's alpha alone, so a beam in front of the marquee can't dim its glow
 * (see glowMaterial).
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

  /** A low-poly tree: trunk and a round crown. @param {number} x @param {number} z @param {number} h @param {number} r @param {string} [leaf] */
  tree(x, z, h, r, leaf = LEAF) {
    this.cylinder(0.22, 0.32, h, 6, '#8A5A2B', x, h / 2, z);
    this.add(new IcosahedronGeometry(r, 0), leaf, place(x, h + r * 0.7, z, x + z));
  }

  /** A thin pole between two points. @param {Vector3} a @param {Vector3} b @param {number} r @param {string} color */
  pole(a, b, r, color) {
    const dir = b.clone().sub(a);
    const m = new Matrix4().makeRotationFromQuaternion(
      new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize()),
    );
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    this.add(new CylinderGeometry(r, r, dir.length(), 6), color, m);
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

/**
 * Builds the scene for a quality level.
 * @param {Quality} quality
 * @param {{ adTexture?: import('three').Texture | null }} [options]
 */
export function buildScene(quality, { adTexture = null } = {}) {
  const random = rng(2027);
  const scene = new Scene();
  scene.background = new Color('#1E2A66');
  scene.fog = new Fog('#3B2F7A', 60, 190);

  const camera = new PerspectiveCamera(56, 16 / 9, 0.4, 260);
  camera.rotation.order = 'YXZ';

  scene.add(new HemisphereLight('#FFF1D6', '#5B4A8A', 2.1));
  const sun = new DirectionalLight('#FFE2B0', 1.6);
  sun.position.set(-14, 26, 22);
  scene.add(sun);

  scene.add(sky());
  scene.add(gallery());
  scene.add(plaza());
  scene.add(robsonSquare(random));
  scene.add(eastSide());
  scene.add(acrossTheStreet(random));
  scene.add(skyline(random, quality.mobile ? 26 : 44));

  const marquee = marqueeSign();
  scene.add(marquee.group);

  const ad = adScreen(adTexture);
  scene.add(ad.group);

  const lights = searchlights(quality.searchlights);
  scene.add(lights.group);

  const people = crowd(quality.crowd, quality.mobile ? 6 : 12, random);
  scene.add(people.group);

  const stars = influencers(random);
  scene.add(stars.group);

  const limos = [limo(PINK), limo('#FFFFFF')];
  limos.forEach((l) => scene.add(l.group));

  const flashes = flashBulbs([...people.emitters, ...stars.emitters], quality.mobile ? 14 : 22);
  scene.add(flashes.mesh);

  const paper = confetti(quality.confetti, random);
  scene.add(paper.mesh);

  /**
   * Sets the lens for an aspect ratio: a wide view on landscape screens, and
   * on portrait ones a taller lens that still shows about 50 degrees across.
   * @param {number} aspect
   */
  function setAspect(aspect) {
    camera.aspect = aspect;
    const minHalfWidth = Math.tan((25 * Math.PI) / 180);
    const fitWidth = Math.atan(minHalfWidth / aspect);
    camera.fov = Math.min(80, Math.max(56, (fitWidth * 360) / Math.PI));
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
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      varying vec3 vDir;
      void main() {
        // The sunset glow is strongest in the west, behind Robson Square.
        float west = 0.55 + 0.45 * max(0.0, -vDir.x);
        vec3 c = mix(mix(mid, low, west), mid, smoothstep(-0.02, 0.16, vDir.y));
        c = mix(c, top, smoothstep(0.16, 0.5, vDir.y));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new Mesh(geometry, material);
  dome.renderOrder = -1;

  // A crayon moon and stars all the way round, each turned to face the viewer.
  const b = new Batch();
  b.add(new CircleShape(5.5).geometry(), '#FFF3C4', place(-60, 62, -150, Math.atan2(60, 150)));
  const r = rng(7);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + r() * 0.12;
    const d = 170;
    const y = 30 + r() * 70;
    b.add(
      starShape(1.2 + r() * 1.4, 0.45),
      i % 3 ? '#FFF3C4' : YELLOW,
      place(Math.sin(a) * d, y, -Math.cos(a) * d, -a),
    );
  }
  const lit = b.mesh(false);
  lit.renderOrder = -1;

  // The North Shore mountains, behind the gallery.
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

/** @param {number} w @param {number} h downward-pointing pennant */
function triangle(w, h) {
  const s = new Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, -h);
  s.lineTo(-w / 2, 0);
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
    b.box(9, 0.5, 0.4, STONE_SHADE, sx * 17, 1.6, -5.25);
    // Lit windows, two floors, standing well proud of the walls.
    for (const wx of [9, 11.4]) {
      for (const wy of [3.6, 7.2]) b.box(1.1, 2.1, 0.3, WINDOW, sx * wx, wy, -5.9);
    }
    for (const wy of [3.6, 7.6]) b.box(1.2, 2.3, 0.3, WINDOW, sx * 19.6, wy, -5.3);
    // Banners.
    b.box(2.6, 6.4, 0.2, sx < 0 ? RED : BLUE, sx * 15, 6.2, -5.2);
    b.box(2.2, 0.5, 0.2, YELLOW, sx * 15, 6.2, -5.0);
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
  }
  // Entablature and pediment, with the tympanum set clearly inside it.
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
  b.add(new ExtrudeGeometry(tympanum, { depth: 0.1, bevelEnabled: false }), STONE_SHADE, place(0, 11.65, -1.0));
  // Doorway, glowing.
  b.box(3.4, 5, 0.3, WINDOW, 0, 4.7, -6.05);
  b.box(4.2, 0.5, 0.5, STONE_SHADE, 0, 7.4, -5.95);
  // Drum, dome and lantern.
  b.cylinder(4.6, 4.8, 2.6, 16, STONE, 0, 12.4, -13);
  b.cylinder(4.9, 4.9, 0.5, 16, '#F3EBD8', 0, 13.9, -13);
  b.add(new SphereGeometry(4.6, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), DOME, place(0, 14.1, -13));
  b.cylinder(0.9, 1.1, 1.4, 8, '#F3EBD8', 0, 19.3, -13);
  b.add(new IcosahedronGeometry(0.55, 0), GOLD, place(0, 20.4, -13));
  // Bunting between the columns, below the marquee.
  for (let i = 0; i < 26; i++) {
    const x = -9.6 + i * 0.77;
    const sag = Math.sin(((x + 9.6) / 3.36) * Math.PI) ** 2 * 0.5;
    b.add(triangle(0.55, 0.8), BRIGHTS[i % BRIGHTS.length], place(x, 6.9 - Math.abs(sag), -1.0));
  }
  return b.mesh();
}

function plaza() {
  const b = new Batch();
  // Ground all the way to the horizon, then the plaza, road and pavements on it.
  b.add(new CylinderGeometry(200, 200, 0.2, 24), '#8E8270', place(0, -0.3, 0));
  b.box(150, 0.2, 54, PAVING, 0, -0.1, -6);
  for (let z = 0; z < KERB_Z; z += 3) b.box(60, 0.04, 0.1, '#C4B38F', 0, 0.02, z);
  b.box(200, 0.2, 7.6, ROAD, 0, -0.08, ROAD_Z + 1.9);
  b.box(200, 0.35, 0.4, '#BDB4A6', 0, 0.05, KERB_Z);
  b.box(200, 0.35, 0.4, '#BDB4A6', 0, 0.05, ROAD_Z + 5.7);
  for (let x = -90; x < 90; x += 4.4) b.box(2.2, 0.04, 0.18, YELLOW, x, 0.04, ROAD_Z + 1.9);
  b.box(200, 0.2, 60, '#D9CDB0', 0, -0.06, ROAD_Z + 36);

  // Red carpet from the kerb, up the steps, to the door. It sits on top of
  // each tread and stands just proud of each riser, so nothing is coplanar.
  b.box(3, 0.06, KERB_Z - 0.2 - 3.0, CARPET, 0, 0.04, (KERB_Z - 0.2 + 3.0) / 2);
  for (let i = 0; i < 8; i++) {
    const h = 2.2 - i * 0.275;
    b.box(3, 0.05, 0.62, CARPET, 0, h + 0.03, -0.55 + i * 0.55 + 0.02);
  }
  b.box(3, 0.05, 5.6, CARPET, 0, 2.23, -3.6);

  // Brass stanchions with velvet ropes on both sides of the carpet.
  for (const sx of [-1, 1]) {
    /** @type {Vector3[]} */
    const tops = [];
    for (let z = 3.6; z <= KERB_Z - 0.6; z += 2.2) {
      const x = sx * 2.3;
      b.cylinder(0.28, 0.36, 0.12, 8, GOLD, x, 0.08, z);
      b.cylinder(0.08, 0.08, 1.2, 6, GOLD, x, 0.7, z);
      b.add(new IcosahedronGeometry(0.16, 0), GOLD, place(x, 1.34, z));
      tops.push(new Vector3(x, 1.26, z));
    }
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i];
      const c = tops[i + 1];
      const mid = a.clone().lerp(c, 0.5);
      mid.y -= 0.32;
      b.add(new TubeGeometry(new CatmullRomCurve3([a, mid, c]), 8, 0.09, 6, false), '#8C1730');
    }
  }

  // A balloon arch over the carpet where it meets the kerb.
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI;
    b.add(
      new IcosahedronGeometry(0.42, 1),
      BRIGHTS[i % BRIGHTS.length],
      place(Math.cos(a) * 3.6, 0.3 + Math.sin(a) * 5.2, KERB_Z - 1.1),
    );
  }

  // Planters with palms at the corners of the carpet.
  for (const [x, z] of [
    [-5.5, 2.5],
    [5.5, 2.5],
    [-5.5, KERB_Z - 1],
    [5.5, KERB_Z - 1],
  ]) {
    b.box(1.6, 0.9, 1.6, STONE_SHADE, x, 0.45, z);
    b.cylinder(0.16, 0.22, 3.6, 6, '#8A5A2B', x, 2.6, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + x;
      b.add(
        new BoxGeometry(2.4, 0.08, 0.55),
        GREEN,
        place(x + Math.cos(a) * 1.0, 4.35, z + Math.sin(a) * 1.0, -a, 0, -0.45),
      );
    }
  }
  return b.mesh();
}

/**
 * The west side: Robson Square's stepped terraces with trees, a round
 * fountain and a row of brand activation tents.
 * @param {() => number} random
 */
function robsonSquare(random) {
  const b = new Batch();
  // Terraces stepping up and away.
  for (let k = 0; k < 4; k++) {
    const x = -30 - k * 5;
    const h = 0.9 + k * 1.1;
    b.box(5, h, 30, k % 2 ? '#D3C3A0' : STONE_SHADE, x, h / 2, 6);
    b.box(4.2, 0.2, 29, '#4A9440', x, h + 0.1, 6);
    for (let z = -8; z <= 20; z += 7)
      b.tree(x + (random() - 0.5), z + random() * 2, 2.2 + random(), 1.4 + random() * 0.6);
  }
  // The fountain.
  b.cylinder(3.4, 3.6, 0.8, 18, STONE, -16, 0.4, 5);
  b.cylinder(3.0, 3.0, 0.1, 18, '#5FA8E8', -16, 0.75, 5);
  b.cylinder(0.5, 0.7, 1.4, 8, STONE, -16, 1.4, 5);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.pole(new Vector3(-16, 2.0, 5), new Vector3(-16 + Math.cos(a) * 2.2, 0.8, 5 + Math.sin(a) * 2.2), 0.1, '#BFE3FF');
  }
  b.cylinder(0.14, 0.14, 2.4, 6, '#BFE3FF', -16, 3.2, 5);
  // Activation tents with striped roofs.
  [
    [-12, 19, RED],
    [-19, 16, BLUE],
    [-24, 10.5, PURPLE],
  ].forEach(([x, z, color], i) => {
    const xx = /** @type {number} */ (x);
    const zz = /** @type {number} */ (z);
    b.box(4.2, 2.4, 4.2, '#FFF7E6', xx, 1.2, zz, i * 0.4);
    b.add(new ConeGeometry(3.4, 2.2, 4), /** @type {string} */ (color), place(xx, 3.5, zz, i * 0.4 + Math.PI / 4));
    b.box(2.2, 0.8, 0.12, YELLOW, xx, 1.8, zz + 2.12, i * 0.4);
  });
  return b.mesh();
}

/** The east side: the step-and-repeat wall, the projector tower, the big screen's truss and a food truck. */
function eastSide() {
  const b = new Batch();
  // Projector tower beside the gallery: a scaffold, a platform and the
  // projector, aimed across the east side at the screen.
  const P = PROJECTOR;
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    b.cylinder(0.1, 0.1, 5.4, 6, '#9AA0B5', P.x + dx, 2.7, P.z + dz);
  }
  for (const y of [1.8, 3.6]) {
    b.pole(new Vector3(P.x - 1, y, P.z - 1), new Vector3(P.x + 1, y + 1.2, P.z + 1), 0.06, '#9AA0B5');
    b.pole(new Vector3(P.x + 1, y, P.z - 1), new Vector3(P.x - 1, y + 1.2, P.z + 1), 0.06, '#9AA0B5');
  }
  b.box(2.6, 0.25, 2.6, INK, P.x, 5.45, P.z);
  const lens = projectorLens();
  const aim = SCREEN.clone().sub(lens).setY(0).normalize();
  b.box(1.4, 0.9, 1.8, PURPLE, P.x, 6.0, P.z, Math.atan2(aim.x, aim.z));
  b.pole(lens.clone().addScaledVector(aim, -0.3), lens.clone().addScaledVector(aim, 0.1), 0.36, INK);
  // Step-and-repeat photo wall beside the carpet, facing it.
  b.box(0.3, 3.4, 7, '#FFFDF5', 6.4, 1.9, 7.5);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      b.box(
        0.08,
        0.5,
        0.5,
        BRIGHTS[(r * 3 + c) % BRIGHTS.length],
        6.17,
        0.8 + r * 0.75,
        4.6 + c * 0.82 + (r % 2) * 0.41,
      );
    }
  }
  b.cylinder(0.08, 0.08, 3.6, 6, INK, 6.5, 1.8, 4.0);
  b.cylinder(0.08, 0.08, 3.6, 6, INK, 6.5, 1.8, 11.0);
  // The big screen's truss: two towers and a header.
  for (const z of [2.2, 19.8]) {
    for (const dx of [-0.5, 0.5]) {
      for (const dz of [-0.5, 0.5]) b.cylinder(0.08, 0.08, 13.5, 6, '#9AA0B5', 25 + dx, 6.75, z + dz);
    }
    for (let y = 1; y < 13; y += 1.5)
      b.pole(new Vector3(24.5, y, z - 0.5), new Vector3(25.5, y + 1.5, z + 0.5), 0.05, '#9AA0B5');
  }
  b.box(1.2, 1.0, 18.6, '#9AA0B5', 25, 13.4, 11);
  b.box(0.5, 9.6, 16.6, INK, 25.35, 7.4, 11);
  // A food truck.
  b.box(6.5, 2.8, 2.6, YELLOW, 17, 1.9, 23.6 - 6, Math.PI / 2);
  b.box(6.5, 0.5, 2.7, RED, 17, 3.45, 23.6 - 6, Math.PI / 2);
  b.box(0.1, 1.0, 3.2, '#2B2F5E', 15.68, 2.2, 17.6);
  b.box(0.3, 0.12, 3.6, RED, 15.4, 2.85, 17.6);
  for (const dz of [-2.2, 2.2])
    b.add(new CylinderGeometry(0.5, 0.5, 2.8, 10), INK, place(17, 0.5, 17.6 + dz, 0, 0, Math.PI / 2));
  // Trees along the east edge.
  for (let z = -2; z <= 20; z += 5.5) b.tree(31, z, 2.8, 1.7);
  return b.mesh();
}

/**
 * The south side of the street: a row of shops with lit windows, awnings and
 * signs, and the hotel tower with its green copper roof.
 * @param {() => number} random
 */
function acrossTheStreet(random) {
  const b = new Batch();
  const z0 = ROAD_Z + 7;
  let x = -70;
  let i = 0;
  while (x < 70) {
    const w = 7 + random() * 6;
    const h = 7 + random() * 12;
    const color = ['#7B5E9E', '#C9776A', '#5E7FB8', '#B58A5A', '#6A9E7A'][i % 5];
    b.box(w - 0.4, h, 8, color, x + w / 2, h / 2, z0 + 4);
    for (let y = 3.5; y < h - 1.5; y += 3) {
      for (let k = 0; k < Math.floor(w / 2.4); k++) {
        if (random() > 0.3) b.box(1.1, 1.4, 0.3, WINDOW, x + 1.4 + k * 2.4, y, z0 - 0.05);
      }
    }
    b.box(w - 1.4, 1.8, 0.3, '#FFE7A8', x + w / 2, 1.2, z0 - 0.05);
    b.box(w - 1, 0.25, 1.4, BRIGHTS[i % BRIGHTS.length], x + w / 2, 2.55, z0 - 0.7);
    x += w;
    i++;
  }
  // The hotel: a tall block with a pitched copper roof.
  b.box(16, 34, 14, '#B9A27E', 24, 17, z0 + 22);
  b.add(new ConeGeometry(11.5, 9, 4), '#5FAE92', place(24, 38.5, z0 + 22, Math.PI / 4));
  for (let y = 4; y < 33; y += 3.2) {
    for (let k = 0; k < 5; k++) if (random() > 0.35) b.box(1.2, 1.5, 0.3, WINDOW, 18.5 + k * 2.8, y, z0 + 14.9);
  }
  // Street trees on both pavements.
  for (let tx = -60; tx <= 60; tx += 9) {
    if (Math.abs(tx) > 6) b.tree(tx + 2, KERB_Z - 0.9, 2.6, 1.3);
    b.tree(tx - 2, ROAD_Z + 6.4, 2.6, 1.3);
  }
  return b.mesh();
}

/**
 * City towers in a ring all round, with lit windows facing the viewer.
 * @param {() => number} random
 * @param {number} count
 */
function skyline(random, count) {
  const b = new Batch();
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
    b.box(w, h, w, i % 3 ? '#3A3F7A' : '#4B3F86', px, h / 2, pz, ry);
    // Windows on the face toward the viewer.
    const fx = -Math.sin(a);
    const fz = Math.cos(a);
    const sideX = Math.cos(a);
    const sideZ = Math.sin(a);
    for (let y = 3; y < h - 2; y += 3.4) {
      for (let k = -1; k <= 1; k++) {
        if (random() > 0.45) {
          b.box(
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
  return b.mesh();
}

/**
 * An unlit material that marks its pixels as glowing: it writes alpha 0 into
 * the render target, which the crayon pass reads as "light source" (full
 * colour, no ink, a hatched halo around it). Every other material must write
 * alpha 1. Works on plain and instanced meshes.
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
      void main() { gl_FragColor = vec4(vColor, 0.0); }`,
  });
}

/**
 * SANDBOX in marquee lights on an ink-black board across the front of the
 * portico: solid, touching letter pixels that glow warm yellow, bulbs on top
 * with a soft travelling sparkle, and a chaser border that fades rather than
 * blinks. The letters themselves never dim, so the word always reads.
 */
function marqueeSign() {
  const group = new Group();
  const b = new Batch();
  const W = 13.4;
  const H = 3.3;
  const y = 9.3;
  const z = 0.0;
  b.box(W, H, 0.5, INK, 0, y, z);
  b.box(W + 0.7, 0.4, 0.7, GOLD, 0, y + H / 2, z);
  b.box(W + 0.7, 0.4, 0.7, GOLD, 0, y - H / 2, z);
  for (const sx of [-1, 1]) {
    b.box(0.4, H + 0.4, 0.7, GOLD, (sx * (W + 0.3)) / 2, y, z);
    b.box(0.3, 0.3, 1.6, INK, sx * (W / 2 - 1.5), y - 0.6, z - 0.9);
  }
  group.add(b.mesh());

  const spacing = 0.3;
  const pixels = bulbLayout('SANDBOX').map((p) => ({
    x: p.x * spacing,
    y: y + p.y * spacing,
    column: Math.round(p.x),
  }));
  const letters = new InstancedMesh(new BoxGeometry(spacing, spacing, 0.12), glowMaterial(), pixels.length);
  const bulbs = new InstancedMesh(new IcosahedronGeometry(0.085, 0), glowMaterial(), pixels.length);
  const m = new Matrix4();
  const letterColor = new Color('#FFC93A');
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
  const chasers = new InstancedMesh(new IcosahedronGeometry(0.13, 0), glowMaterial(), border.length);
  border.forEach((p, i) => chasers.setMatrixAt(i, m.makeTranslation(p.x, p.y, z + 0.32)));
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
  const c = new Color();
  /** @param {number} t */
  function update(t) {
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
  return { group, update };
}

/**
 * The big screen on the east truss and the projector's beam from the tower
 * in Robson Square, right over the crowd. With a texture, the panels cycle
 * through the site's own ads; without one, through procedural colour panels.
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
      uColors: { value: [RED, BLUE, YELLOW, GREEN, PURPLE, ORANGE].map((c) => new Color(c)) },
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
        float sun = smoothstep(0.23, 0.21, length(vUv - vec2(0.5, 0.45 + 0.08 * sin(uTime * 2.0))));
        vec3 panel = mix(mix(a, a * 0.8, stripes), b, sun);
        vec3 c = mix(panel, ad, uHasAds);
        // Each slide fades up from a little darker over half a second.
        gl_FragColor = vec4(c * mix(0.75, 1.0, smoothstep(0.0, 0.15, local)), 1.0);
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
  const bright = new Color('#FFF1B8').multiplyScalar(0.22);
  const faint = new Color('#FFF1B8').multiplyScalar(0.03);
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
    color: '#FFF4C9',
    transparent: true,
    opacity: 0.08,
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
 * The crowd all round: instanced bodies, heads, raised arms and phones, and a
 * row of paparazzi with cameras behind the ropes near the kerb.
 * @param {number} count
 * @param {number} paparazzi
 * @param {() => number} random
 */
function crowd(count, paparazzi, random) {
  const group = new Group();
  /** @type {{ x: number, z: number, h: number, phase: number, phone: boolean, camera: boolean, arms: boolean, ry: number }[]} */
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
    (x > 5.9 && x < 7 && z > 3.6 && z < 11.4) || // the photo wall
    (x > 13.4 && x < 20.6 && z > 15.8 && z < 19.4) || // the food truck
    x > 23.5 || // the screen
    x < -27 || // the terraces
    [
      [-5.5, 2.5],
      [5.5, 2.5],
      [-5.5, KERB_Z - 1],
      [5.5, KERB_Z - 1],
    ].some(([px, pz]) => Math.hypot(x - px, z - pz) < 1.4); // planters

  /** @param {number} x @param {number} z */
  const crowded = (x, z) => folks.some((f) => Math.hypot(f.x - x, f.z - z) < 0.8);

  // Paparazzi first, in two short rows at the kerb end of the ropes.
  for (let i = 0; i < paparazzi; i++) {
    const sx = i % 2 ? 1 : -1;
    const x = sx * (3.1 + (Math.floor(i / 2) % 3) * 0.95);
    const z = KERB_Z - 2.6 - Math.floor(i / 6) * 2.4 - (Math.floor(i / 2) % 3) * 0.5;
    folks.push({
      x,
      z,
      h: 0.95,
      phase: random() * 6.3,
      phone: false,
      camera: true,
      arms: false,
      ry: sx > 0 ? -Math.PI / 2 : Math.PI / 2,
    });
  }
  let guard = 0;
  while (folks.length < count + paparazzi && guard++ < count * 40) {
    // Most of the crowd within 22 m, a few on the far pavement.
    let x;
    let z;
    if (random() < 0.12) {
      x = (random() - 0.5) * 80;
      z = ROAD_Z + 6.4 + random() * 1.6;
    } else {
      const a = random() * Math.PI * 2;
      const r = 5.6 + Math.sqrt(random()) * 18;
      x = EYE.x + Math.sin(a) * r;
      z = EYE.z + Math.cos(a) * r;
    }
    if (z <= ROAD_Z + 5.9 && blocked(x, z)) continue;
    if (crowded(x, z)) continue;
    // Face the carpet if beside it, otherwise the viewer.
    const tx = Math.abs(x) < 14 && z > 2.6 && z < KERB_Z ? 0 : EYE.x;
    const tz = Math.abs(x) < 14 && z > 2.6 && z < KERB_Z ? z : EYE.z;
    const near = Math.hypot(x - EYE.x, z - EYE.z) < 10;
    folks.push({
      x,
      z,
      h: 0.85 + random() * 0.3,
      phase: random() * Math.PI * 2,
      phone: near ? random() > 0.35 : random() > 0.6,
      camera: false,
      arms: random() > 0.6,
      ry: Math.atan2(tx - x, tz - z) + (random() - 0.5) * 0.5,
    });
  }
  const n = folks.length;
  const lambert = new MeshLambertMaterial({ flatShading: true });
  const body = new InstancedMesh(new CylinderGeometry(0.26, 0.4, 1.3, 6).translate(0, 0.65, 0), lambert, n);
  const head = new InstancedMesh(new IcosahedronGeometry(0.27, 0), lambert, n);
  const armsGeometry = mergeGeometries([
    new BoxGeometry(0.13, 0.75, 0.13).translate(0, 0.35, 0).rotateZ(0.5),
    new BoxGeometry(0.13, 0.75, 0.13).translate(0, 0.35, 0).rotateZ(-0.5),
  ]);
  const arms = new InstancedMesh(armsGeometry, lambert, n);
  const phones = new InstancedMesh(new BoxGeometry(0.28, 0.44, 0.07), new MeshBasicMaterial({ color: '#BFE3FF' }), n);
  const cameras = new InstancedMesh(
    mergeGeometries([
      new BoxGeometry(0.36, 0.26, 0.24),
      new CylinderGeometry(0.09, 0.1, 0.24, 8).rotateX(Math.PI / 2).translate(0, 0, 0.22),
    ]),
    new MeshLambertMaterial({ color: INK }),
    Math.max(1, paparazzi),
  );
  const skin = SKIN.map((c) => new Color(c));
  folks.forEach((f, i) => {
    body.setColorAt(i, new Color(f.camera ? '#3A3550' : BRIGHTS[Math.floor(random() * BRIGHTS.length)]));
    head.setColorAt(i, skin[i % skin.length]);
    arms.setColorAt(i, skin[i % skin.length]);
  });
  [body, head, arms, phones, cameras].forEach((m) => {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    group.add(m);
  });

  /** Where phones and cameras flash, as live positions. Cameras fire more. */
  const devices = folks.filter((f) => f.phone || f.camera);
  /** @type {Emitter[]} */
  const emitters = devices.map((f) => ({ position: new Vector3(f.x, 2, f.z), weight: f.camera ? 3 : 1 }));

  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const up = new Vector3(0, 1, 0);
  /** @param {number} t */
  function update(t) {
    let k = 0;
    let c = 0;
    folks.forEach((f, i) => {
      // A smooth bounce: no kinks, so nothing snaps from one frame to the next.
      const hop = (0.5 - 0.5 * Math.cos(t * 3.2 + f.phase)) ** 2 * 0.2 * (f.arms ? 1 : 0.4);
      q.setFromAxisAngle(up, f.ry + Math.sin(t * 0.8 + f.phase) * 0.12);
      s.set(f.h, f.h, f.h);
      body.setMatrixAt(i, m.compose(p.set(f.x, hop, f.z), q, s));
      head.setMatrixAt(i, m.compose(p.set(f.x, hop + 1.55 * f.h, f.z), q, s));
      const armsUp = f.arms || f.camera ? 1 : 0.0001;
      arms.setMatrixAt(i, m.compose(p.set(f.x, hop + 1.15 * f.h, f.z), q, s.set(f.h, f.h * armsUp, f.h)));
      if (f.phone || f.camera) {
        const lift = f.camera ? 1.62 : 1.9 + 0.25 * Math.sin(t * 1.3 + f.phase);
        p.set(f.x + Math.sin(f.ry) * 0.38, hop + lift * f.h, f.z + Math.cos(f.ry) * 0.38);
        if (f.camera) cameras.setMatrixAt(c++, m.compose(p, q, s.set(1, 1, 1)));
        else phones.setMatrixAt(k++, m.compose(p, q, s.set(1, 1, 1)));
        emitters[devices.indexOf(f)].position.copy(p);
      }
    });
    phones.count = k;
    cameras.count = c;
    [body, head, arms, phones, cameras].forEach((mesh) => (mesh.instanceMatrix.needsUpdate = true));
  }
  return { group, update, emitters };
}

/**
 * Influencers posing all round the viewer with selfie sticks and phones.
 * @param {() => number} random
 */
function influencers(random) {
  const group = new Group();
  const looks = [
    { x: -0.7, z: 6.5, outfit: YELLOW, hair: INK, stick: true },
    { x: 0.9, z: 7.4, outfit: PURPLE, hair: ORANGE, stick: false },
    { x: -0.4, z: 3.8, outfit: '#FFFFFF', hair: '#6B3A1E', stick: true },
    { x: 0.6, z: 18.6, outfit: GREEN, hair: PINK, stick: false },
    { x: -0.7, z: 19.6, outfit: PINK, hair: '#6B3A1E', stick: true },
    { x: 9.5, z: 8.5, outfit: BLUE, hair: YELLOW, stick: true },
    { x: 14, z: 14.5, outfit: ORANGE, hair: INK, stick: false },
    { x: -9, z: 9, outfit: RED, hair: '#F1D2B6', stick: true },
    { x: -9.5, z: 18.5, outfit: '#FFFFFF', hair: PURPLE, stick: false },
  ];
  /** @type {{ group: Group, phase: number, base: Vector3, ry: number }[]} */
  const figures = [];
  /** @type {Emitter[]} */
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
    b.add(new BoxGeometry(0.15, 0.8, 0.15), skin, place(0.48, 2.25, 0.1, 0, -0.4, 0.5));
    const tip = look.stick ? new Vector3(1.4, 3.9, 0.9) : new Vector3(0.66, 2.75, 0.45);
    if (look.stick) b.pole(new Vector3(0.62, 2.6, 0.2), tip, 0.045, INK);
    b.box(0.32, 0.52, 0.08, '#BFE3FF', tip.x, tip.y, tip.z, -0.6);
    const g = new Group();
    g.add(b.mesh());
    const base = new Vector3(look.x, 0.04, look.z);
    g.position.copy(base);
    // Pose for the viewer, more or less.
    const ry = Math.atan2(EYE.x - look.x, EYE.z - look.z) + (random() - 0.5) * 0.8;
    g.rotation.y = ry;
    group.add(g);
    figures.push({ group: g, phase: random() * 6, base, ry });
    emitters.push(worldPoint(g, tip, 3));
  });
  /** @param {number} t */
  function update(t) {
    figures.forEach((f) => {
      f.group.rotation.y = f.ry + Math.sin(t * 0.6 + f.phase) * 0.45;
      f.group.position.y = f.base.y + (0.5 - 0.5 * Math.cos(t * 2 + f.phase)) * 0.06;
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
  b.box(5.4, 0.5, 2.06, '#2B2F5E', -0.4, 1.65, 0);
  b.box(0.12, 0.3, 0.6, YELLOW, 4.12, 0.95, 0.65);
  b.box(0.12, 0.3, 0.6, YELLOW, 4.12, 0.95, -0.65);
  b.box(0.12, 0.25, 0.5, RED, -4.12, 0.95, 0.7);
  b.box(0.12, 0.25, 0.5, RED, -4.12, 0.95, -0.7);
  for (const x of [-2.9, 2.6]) {
    for (const z of [-1.1, 1.1])
      b.add(new CylinderGeometry(0.45, 0.45, 0.3, 10), INK, place(x, 0.45, z, 0, Math.PI / 2));
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
 * couple of frames and fades over a few more, and glows through the crayon
 * pass instead of popping in and out.
 * @param {Emitter[]} emitters
 * @param {number} slots
 */
function flashBulbs(emitters, slots) {
  const mesh = new InstancedMesh(starShape(0.8, 0.3), glowMaterial(), slots);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.name = 'flashes';
  const flash = new Color('#FFFBE0');
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
 * Confetti falling all round the viewer. Each piece grows in at the top and
 * shrinks away under the ground, so none of them blink in or out.
 * @param {number} count
 * @param {() => number} random
 */
function confetti(count, random) {
  const TOP = 20;
  const mesh = new InstancedMesh(new PlaneGeometry(0.26, 0.16), new MeshBasicMaterial({ side: DoubleSide }), count);
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
