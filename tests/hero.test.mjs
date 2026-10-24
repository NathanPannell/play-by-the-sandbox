import { BoxGeometry, Color, InstancedMesh, Mesh, Texture, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  BOIL_FPS,
  BOIL_VARIANTS,
  OUTLINE_PX,
  TEXTURE_SIZE,
  boilStep,
  createCrayon,
  crayonTexture,
  hullGeometry,
} from '../src/hero/crayon.js';
import { bulbLayout } from '../src/hero/marquee.js';
import {
  MAX_DPR,
  MOBILE_DPR,
  SOFTWARE_SCALE,
  adaptScale,
  hash1,
  isSoftwareRenderer,
  pickQuality,
  rng,
} from '../src/hero/quality.js';
import { EYE, REVOLUTION, STILL_T, buildScene, glowMaterial } from '../src/hero/scene.js';

const desktop = pickQuality({ width: 1440, devicePixelRatio: 2 });
const phone = pickQuality({ width: 390, devicePixelRatio: 3, coarsePointer: true });

/**
 * Counts meshes and instances. `scalable` leaves out the marquee, which is the
 * same size on every device.
 * @param {import('three').Object3D} root
 * @param {{ scalable?: boolean }} [options]
 */
function census(root, { scalable = false } = {}) {
  let meshes = 0;
  let instances = 0;
  root.traverse((o) => {
    if (scalable && o.name.startsWith('marquee-')) return;
    if (o instanceof InstancedMesh) instances += o.count;
    else if (o instanceof Mesh) meshes++;
  });
  return { meshes, instances };
}

/** World positions of every instance and mesh, to compare two frames. */
function snapshot(/** @type {import('three').Scene} */ scene) {
  scene.updateMatrixWorld(true);
  /** @type {number[]} */
  const out = [];
  scene.traverse((o) => {
    if (o instanceof InstancedMesh) out.push(...o.instanceMatrix.array.slice(0, o.count * 16));
    else out.push(...o.matrixWorld.elements);
  });
  return out;
}

describe('quality', () => {
  it('caps the device pixel ratio at 1.5', () => {
    expect(MAX_DPR).toBe(1.5);
    expect(desktop.dpr).toBe(1.5);
    expect(pickQuality({ width: 1440, devicePixelRatio: 1 }).dpr).toBe(1);
    expect(pickQuality({ width: 1440, devicePixelRatio: 0 }).dpr).toBe(1);
  });

  it('gives phones a lighter scene at half the frame rate', () => {
    expect(phone.mobile).toBe(true);
    expect(desktop.mobile).toBe(false);
    expect(phone.crowd).toBeLessThan(desktop.crowd);
    expect(phone.confetti).toBeLessThan(desktop.confetti);
    expect(phone.searchlights).toBeLessThan(desktop.searchlights);
    expect(phone.frameSkip).toBe(1);
    expect(desktop.frameSkip).toBe(0);
    // Antialiasing, so thin things don't crawl as the camera turns.
    expect(desktop.msaa).toBe(4);
    expect(phone.msaa).toBe(2);
  });

  it('gives software WebGL a phone-sized scene at reduced resolution, without antialiasing', () => {
    const cpu = pickQuality({ width: 1440, devicePixelRatio: 2, software: true });
    expect(cpu.mobile).toBe(false);
    expect(cpu.lite).toBe(true);
    expect(cpu.dpr).toBe(SOFTWARE_SCALE);
    expect(cpu.msaa).toBe(0);
    expect(cpu.frameSkip).toBe(2);
    expect(cpu.crowd).toBe(phone.crowd);
    expect(desktop.lite).toBe(false);
    expect(phone.lite).toBe(true);
    for (const name of [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'llvmpipe (LLVM 15.0.7, 256 bits)',
      'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0)',
    ])
      expect(isSoftwareRenderer(name), name).toBe(true);
    for (const name of [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'Apple M2',
      'Adreno (TM) 740',
    ])
      expect(isSoftwareRenderer(name), name).toBe(false);
  });

  it('caps phones at a lower pixel ratio', () => {
    expect(MOBILE_DPR).toBe(1.25);
    expect(phone.dpr).toBe(1.25);
    expect(pickQuality({ width: 390, devicePixelRatio: 1 }).dpr).toBe(1);
  });

  it('adapts the render scale to the measured frame time, without hunting', () => {
    const budget = 1000 / 30;
    // Slow frames: down 15% at once, not below the floor.
    expect(adaptScale({ scale: 1, interval: 60, budget, calm: 2, min: 0.55 })).toEqual({ scale: 0.85, calm: 0 });
    expect(adaptScale({ scale: 0.6, interval: 60, budget, calm: 0, min: 0.55 })).toEqual({ scale: 0.55, calm: 0 });
    // A little over budget: hold, and start counting calm windows again.
    expect(adaptScale({ scale: 0.85, interval: budget * 1.2, budget, calm: 2, min: 0.55 })).toEqual({
      scale: 0.85,
      calm: 0,
    });
    // On budget: only after three calm windows does it step back up, never past 1.
    let state = { scale: 0.85, calm: 0 };
    state = adaptScale({ ...state, interval: budget, budget, min: 0.55 });
    state = adaptScale({ ...state, interval: budget, budget, min: 0.55 });
    expect(state).toEqual({ scale: 0.85, calm: 2 });
    state = adaptScale({ ...state, interval: budget, budget, min: 0.55 });
    expect(state).toEqual({ scale: 1, calm: 0 });
    expect(adaptScale({ scale: 1, interval: budget, budget, calm: 5, min: 0.55 })).toEqual({ scale: 1, calm: 6 });
  });

  it('treats touch tablets as mobile', () => {
    expect(pickQuality({ width: 1024, devicePixelRatio: 2, coarsePointer: true }).mobile).toBe(true);
    expect(pickQuality({ width: 1024, devicePixelRatio: 2 }).mobile).toBe(false);
  });

  it('has a seeded random source and a frame-rate independent hash', () => {
    const a = rng(5);
    const b = rng(5);
    const seq = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seq);
    expect(seq.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(rng()()).toBe(rng(1)());
    expect(hash1(3)).toBe(hash1(3));
    expect(hash1(3)).not.toBe(hash1(4));
    expect(hash1(-7)).toBeGreaterThanOrEqual(0);
  });
});

describe('marquee', () => {
  it('spells SANDBOX in a centred 5x7 dot matrix', () => {
    const bulbs = bulbLayout('sandbox');
    expect(new Set(bulbs.map((b) => b.letter))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
    const xs = bulbs.map((b) => b.x);
    expect(Math.min(...xs)).toBe(-Math.max(...xs));
    expect(Math.max(...bulbs.map((b) => b.y))).toBe(3);
    expect(Math.min(...bulbs.map((b) => b.y))).toBe(-3);
    // The O is a ring of 16 bulbs.
    expect(bulbs.filter((b) => b.letter === 5)).toHaveLength(16);
  });

  it('refuses letters it has no glyph for', () => {
    expect(() => bulbLayout('SANDBOXZ')).toThrow('No marquee glyph for "Z"');
  });
});

describe('scene', () => {
  it('builds the premiere: gallery, sky, marquee, crowd, limos, flashes, confetti', () => {
    const world = buildScene(desktop);
    const { meshes, instances } = census(world.scene);
    expect(meshes).toBeGreaterThan(10);
    // Crowd bodies, heads and arms, plus confetti and bulbs.
    expect(instances).toBeGreaterThan(desktop.crowd * 3 + desktop.confetti);
    expect(world.camera.fov).toBeGreaterThan(30);
  });

  it('is lighter on phones', () => {
    const big = census(buildScene(desktop).scene, { scalable: true });
    const small = census(buildScene(phone).scene, { scalable: true });
    expect(small.instances).toBeLessThan(big.instances / 2);
    expect(small.meshes).toBeLessThan(big.meshes);
  });

  it('is a pure function of time, so the still frame never changes', () => {
    const a = buildScene(desktop);
    const b = buildScene(desktop);
    a.update(11.2);
    b.update(3);
    b.update(11.2);
    expect(snapshot(b.scene)).toEqual(snapshot(a.scene));
    a.update(11.7);
    expect(snapshot(a.scene)).not.toEqual(snapshot(b.scene));
  });

  it('pulls a limo up to the carpet, waits, then drives on', () => {
    const world = buildScene(desktop);
    /** @param {number} t */
    const limoX = (t) => {
      world.update(t);
      /** @type {number[]} */
      const xs = [];
      world.scene.children.forEach((c) => {
        if (c.type === 'Group' && Math.abs(c.position.z - 23) < 0.01) xs.push(c.position.x);
      });
      return xs;
    };
    expect(limoX(10)).toContain(0); // parked
    expect(limoX(2)[0]).toBeLessThan(-10); // arriving from the left
    expect(limoX(16)[0]).toBeGreaterThan(0); // driving off
    expect(limoX(22)[0]).toBe(-120); // out of sight
  });

  it('stands the viewer on the carpet and turns a full circle, seamlessly, forever', () => {
    const world = buildScene(desktop);
    const { camera } = world;
    /** @param {number} t */
    const look = (t) => {
      world.update(t);
      return new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
    };
    world.update(STILL_T);
    expect(camera.position.distanceTo(EYE)).toBeLessThan(0.1);
    // Facing the gallery (north) at the still moment.
    expect(look(STILL_T).z).toBeLessThan(-0.99);
    // Then east, south and west a quarter, a half and three quarters of a turn later.
    expect(Math.abs(look(STILL_T + REVOLUTION / 4).x)).toBeGreaterThan(0.99);
    expect(look(STILL_T + REVOLUTION / 2).z).toBeGreaterThan(0.99);
    // Whole turns later the camera, bob and all, is exactly where it was: no seam.
    world.update(STILL_T + 7);
    const before = camera.quaternion.clone();
    const height = camera.position.y;
    world.update(STILL_T + 7 + REVOLUTION * 3);
    expect(camera.quaternion.angleTo(before)).toBeLessThan(1e-6);
    expect(camera.position.y).toBeCloseTo(height, 9);
    // And it moves a little every frame, never a lot.
    let worst = 0;
    for (let t = 0; t < REVOLUTION; t += 1 / 30) {
      world.update(t);
      const q = camera.quaternion.clone();
      world.update(t + 1 / 30);
      worst = Math.max(worst, camera.quaternion.angleTo(q));
    }
    expect(worst).toBeLessThan(0.01);
  });

  it('can hold the camera still while the scene plays, for graphics QA', () => {
    const world = buildScene(desktop);
    world.update(5, 5);
    const held = world.camera.quaternion.clone();
    world.update(9, 5);
    expect(world.camera.quaternion.angleTo(held)).toBeLessThan(1e-6);
  });

  it('pops camera flashes at phones', () => {
    const world = buildScene(phone);
    /** @type {InstancedMesh[]} */
    const instanced = [];
    world.scene.traverse((o) => o instanceof InstancedMesh && instanced.push(o));
    let seen = 0;
    for (let t = 0; t < 6; t += 0.05) {
      world.update(t);
      seen = Math.max(seen, ...instanced.filter((m) => m.renderOrder === 2).map((m) => m.count));
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('widens the lens on portrait screens and shifts the scene clear of the text', () => {
    const world = buildScene(phone);
    world.setAspect(16 / 9);
    const wide = world.camera.fov;
    world.setAspect(0.55);
    expect(world.camera.fov).toBeGreaterThan(wide);

    world.setAspect(16 / 9);
    world.update(5);
    const centred = world.camera.quaternion.clone();
    world.setShift(0.2, 0);
    world.update(5);
    expect(world.camera.quaternion.angleTo(centred)).toBeGreaterThan(0.05);
    world.setShift(0, 0.17);
    world.update(5);
    expect(world.camera.quaternion.angleTo(centred)).toBeGreaterThan(0.05);
  });

  it('lights SANDBOX as a glowing sign whose letters never dim', () => {
    const world = buildScene(desktop);
    const letters = /** @type {InstancedMesh} */ (world.scene.getObjectByName('marquee-letters'));
    const bulbs = /** @type {InstancedMesh} */ (world.scene.getObjectByName('marquee-bulbs'));
    const chasers = /** @type {InstancedMesh} */ (world.scene.getObjectByName('marquee-chasers'));
    expect(letters.count).toBe(bulbLayout('SANDBOX').length);
    for (const mesh of [letters, bulbs, chasers]) {
      expect(/** @type {import('three').ShaderMaterial} */ (mesh.material).userData.glow).toBe(true);
    }
    const colours = (/** @type {InstancedMesh} */ mesh) => Array.from(mesh.instanceColor?.array ?? []);
    world.update(1);
    const lettersAt1 = colours(letters);
    const bulbsAt1 = colours(bulbs);
    const chasersAt1 = colours(chasers);
    world.update(1.25);
    expect(colours(letters)).toEqual(lettersAt1);
    expect(colours(bulbs)).not.toEqual(bulbsAt1);
    expect(colours(chasers)).not.toEqual(chasersAt1);
    // Bright: every letter pixel is the same warm marquee yellow.
    const yellow = new Color();
    for (let i = 0; i < letters.count; i++) expect(letters.getColorAt(i, yellow).getHexString()).toBe('ffc93a');
  });

  it('draws light sources in full colour, warmed toward white, straight to the screen', () => {
    const glow = glowMaterial();
    expect(glow.userData.glow).toBe(true);
    expect(glow.fragmentShader).toMatch(/mix\(vColor, vec3\(1\.0, 0\.98, 0\.9\), 0\.3\)/);
    // Custom shaders convert to the screen's colour space themselves.
    expect(glow.fragmentShader).toContain('#include <colorspace_fragment>');
    // Instancing is optional, so the material also works on a plain mesh.
    expect(glow.vertexShader).toMatch(/#ifdef USE_INSTANCING/);
    for (const quality of [desktop, phone]) {
      buildScene(quality).scene.traverse((o) => {
        const material = /** @type {import('three').ShaderMaterial | undefined} */ (/** @type {Mesh} */ (o).material);
        if (material?.isShaderMaterial)
          expect(material.fragmentShader, o.name).toContain('#include <colorspace_fragment>');
      });
    }
  });

  it('marks the marquee for the speech bubble, just under its corner', () => {
    const world = buildScene(desktop);
    const { marquee } = world.anchors;
    const letters = /** @type {InstancedMesh} */ (world.scene.getObjectByName('marquee-letters'));
    letters.geometry.computeBoundingBox();
    expect(marquee.x).toBeGreaterThan(3);
    expect(marquee.y).toBeLessThan(9.3);
    expect(marquee.z).toBeGreaterThan(0);
  });

  it('keeps the influencers still and in one mesh on lighter devices', () => {
    /** @param {import('three').Scene} scene */
    const meshes = (scene) => {
      let n = 0;
      scene.traverse((o) => {
        if (o instanceof Mesh && !(o instanceof InstancedMesh)) n++;
      });
      return n;
    };
    expect(meshes(buildScene(desktop).scene) - meshes(buildScene(phone).scene)).toBeGreaterThanOrEqual(8);
    const world = buildScene(phone);
    world.update(3);
    const a = snapshot(world.scene);
    world.update(3.5);
    expect(snapshot(world.scene)).not.toEqual(a); // the crowd still moves
  });

  it('shows the site ads on the projector wall when given them', () => {
    const ads = new Texture();
    const world = buildScene(desktop, { adTexture: ads });
    /** @type {import('three').ShaderMaterial[]} */
    const screens = [];
    world.scene.traverse((o) => {
      const m = /** @type {import('three').ShaderMaterial} */ (/** @type {Mesh} */ (o).material);
      if (m?.uniforms?.tAds) screens.push(m);
    });
    expect(screens).toHaveLength(1);
    expect(screens[0].uniforms.tAds.value).toBe(ads);
    expect(screens[0].uniforms.uHasAds.value).toBe(1);
    world.update(4);
    expect(screens[0].uniforms.uTime.value).toBe(4);
    expect(buildScene(desktop).scene.getObjectsByProperty('type', 'Mesh').length).toBeGreaterThan(0);
  });
});

describe('crayon on the models', () => {
  const crayon = createCrayon();

  it('draws its strokes in a small tileable texture, four redrawn versions in its channels', () => {
    const data = crayonTexture(64, 5);
    expect(data).toHaveLength(64 * 64 * 4);
    expect(TEXTURE_SIZE).toBeLessThanOrEqual(256);
    for (let k = 0; k < 4; k++) {
      let wax = 0;
      let paper = 0;
      for (let i = k; i < data.length; i += 4) {
        if (data[i] > 110) wax++;
        if (data[i] < 40) paper++;
      }
      const n = data.length / 4;
      // Mostly wax, with paper showing in the gaps.
      expect(wax / n, `wax in variant ${k}`).toBeGreaterThan(0.4);
      expect(paper / n, `paper in variant ${k}`).toBeGreaterThan(0.05);
    }
    // The variants are the same strokes, redrawn: close, but not the same.
    let same = 0;
    let near = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === data[i + 1]) same++;
      if (Math.abs(data[i] - data[i + 1]) < 64) near++;
    }
    expect(same / (data.length / 4)).toBeLessThan(0.9);
    expect(near / (data.length / 4)).toBeGreaterThan(0.6);
    // It tiles: across the wrap, neighbouring texels differ no more than they do inside.
    const at = (/** @type {number} */ x, /** @type {number} */ y) => data[(y * 64 + x) * 4];
    let edge = 0;
    let inside = 0;
    for (let y = 0; y < 64; y++) {
      edge += Math.abs(at(63, y) - at(0, y)) + Math.abs(at(y, 63) - at(y, 0));
      inside += Math.abs(at(31, y) - at(32, y)) + Math.abs(at(y, 31) - at(y, 32));
    }
    expect(edge).toBeLessThan(inside * 1.6);
    // Repeatable: the same seed draws the same strokes.
    expect(crayonTexture(64, 5)).toEqual(data);
  });

  it('is a repeating, mipmapped, anisotropic texture, so it neither tiles at the edges nor shimmers', () => {
    const { map } = createCrayon({ anisotropy: 8 });
    expect(map.generateMipmaps).toBe(true);
    expect(map.anisotropy).toBe(8);
    expect(map.image.width).toBe(TEXTURE_SIZE);
  });

  it('colours in every opaque lit and unlit material, on its own surface, and leaves light sources alone', () => {
    for (const quality of [desktop, phone]) {
      const world = buildScene(quality);
      const kit = createCrayon({ lite: quality.lite });
      const outlined = kit.apply(world.scene);
      expect(outlined).toBeGreaterThan(10);
      /** @type {Set<import('three').Material>} */
      const coloured = new Set();
      world.scene.traverse((o) => {
        const mesh = /** @type {Mesh} */ (o);
        if (!mesh.isMesh) return;
        const material = /** @type {import('three').Material} */ (mesh.material);
        if (material.userData.crayon) coloured.add(material);
        if (material.userData.glow) expect(material.userData.crayon).toBeUndefined();
        if (material.transparent) expect(material.userData.crayon).toBeUndefined();
      });
      expect(coloured.size).toBeGreaterThan(5);
      // The patch: strokes sampled in object space, in the material's own colour, before lighting.
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <color_fragment>',
      };
      const material = [...coloured][0];
      material.onBeforeCompile(/** @type {any} */ (shader), /** @type {any} */ (null));
      expect(shader.vertexShader).toContain('vCrayonPos = position;');
      expect(shader.fragmentShader).toMatch(/#include <color_fragment>\n[\s\S]*diffuseColor\.rgb = mix\(paper/);
      expect(Object.keys(shader.uniforms)).toEqual(['tCrayon', 'uCrayonVariant', 'uCrayonPaper']);
      expect(Boolean(material.defines?.CRAYON_LITE)).toBe(quality.lite);
      kit.dispose();
    }
  });

  it('outlines the solids with an ink hull that follows instanced crowds', () => {
    const world = buildScene(desktop);
    const kit = createCrayon();
    kit.apply(world.scene);
    /** @type {Mesh[]} */
    const hulls = [];
    world.scene.traverse((o) => o.name === 'outline' && hulls.push(/** @type {Mesh} */ (o)));
    expect(hulls.length).toBeGreaterThan(10);
    for (const hull of hulls) {
      expect(hull.material).toBe(kit.outline);
      if (/** @type {InstancedMesh} */ (hull.parent).isInstancedMesh)
        expect(/** @type {InstancedMesh} */ (hull).instanceMatrix).toBe(
          /** @type {InstancedMesh} */ (hull.parent).instanceMatrix,
        );
    }
    // Back faces, pushed out by a constant width on screen, faded by the fog.
    expect(kit.outline.side).toBe(1);
    expect(kit.outline.fog).toBe(true);
    kit.setSize(1920, 1080, 1.5);
    expect(kit.outline.uniforms.uRes.value.toArray()).toEqual([1920, 1080]);
    expect(kit.outline.uniforms.uWidth.value).toBeCloseTo(OUTLINE_PX * 1.5);
    // Flat shapes (bunting, stars) have no inside, so they're left out of the hulls.
    const flat = new Mesh();
    expect(hullGeometry(new BoxGeometry(1, 1, 1)).getAttribute('position').count).toBe(8);
    expect(flat.userData.hull).toBeUndefined();
    kit.dispose();
  });

  it('boils like hand-drawn animation: a few drawings, stepped a few times a second', () => {
    expect(BOIL_FPS).toBeGreaterThanOrEqual(3);
    expect(BOIL_FPS).toBeLessThanOrEqual(8);
    expect(BOIL_VARIANTS).toBe(4);
    const step = 1 / BOIL_FPS;
    for (const t of [0, 1.2, 37, 600]) {
      const at = Math.floor(t * BOIL_FPS) * step;
      expect(boilStep(at + step * 0.1)).toBe(boilStep(at + step * 0.9));
      expect(boilStep(at + step * 1.1)).toBe((boilStep(at + step * 0.5) + 1) % BOIL_VARIANTS);
    }
    expect(boilStep(-step / 2)).toBe(BOIL_VARIANTS - 1);
    // One texture channel and one outline seed per step, for every material at once.
    for (let k = 0; k < BOIL_VARIANTS; k++) {
      crayon.setBoil(k * step + step / 2);
      expect(crayon.outline.uniforms.uSeed.value).toBe(k);
    }
  });

  it('cleans up', () => {
    crayon.dispose();
  });
});
