import {
  Color,
  DataTexture,
  InstancedMesh,
  Matrix4,
  Mesh,
  OneFactor,
  PerspectiveCamera,
  Texture,
  Vector3,
  ZeroFactor,
} from 'three';
import { describe, expect, it } from 'vitest';
import { BOIL_FPS, BOIL_VARIANTS, VARIANTS, WOBBLE_PX, boilStep, createCrayonPass } from '../src/hero/crayon.js';
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
      expect(/** @type {import('three').ShaderMaterial} */ (mesh.material).fragmentShader).toContain(
        'vec4(vColor, 0.0)',
      );
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

  it('marks glowing pixels with zero alpha for the crayon pass, and nothing else', () => {
    const glow = glowMaterial();
    expect(glow.userData.glow).toBe(true);
    expect(glow.fragmentShader).toMatch(/gl_FragColor\s*=\s*vec4\(\s*vColor\s*,\s*0\.0\s*\)/);
    // Instancing is optional, so the material also works on a plain mesh.
    expect(glow.vertexShader).toMatch(/#ifdef USE_INSTANCING/);

    // Every other material must leave alpha at 1: opaque, or additive light
    // that keeps the destination alpha.
    for (const quality of [desktop, phone]) {
      buildScene(quality).scene.traverse((o) => {
        const material = /** @type {import('three').Material | undefined} */ (/** @type {Mesh} */ (o).material);
        if (!material || material.userData.glow) return;
        expect(
          material.opacity === 1 || (material.blendSrcAlpha === ZeroFactor && material.blendDstAlpha === OneFactor),
          o.type,
        ).toBe(true);
        if (material.transparent)
          expect([material.blendSrcAlpha, material.blendDstAlpha]).toEqual([ZeroFactor, OneFactor]);
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

describe('crayon pass', () => {
  const pass = createCrayonPass({ color: new DataTexture(), depth: new DataTexture(), near: 0.5, far: 260 });

  it('draws a full-screen quad with the crayon shader', () => {
    const uniforms = pass.material.uniforms;
    expect(pass.scene.children).toHaveLength(1);
    expect(pass.material.fragmentShader).toContain('tDepth');
    // Light sources keep their colour and get a halo instead of ink.
    expect(pass.material.fragmentShader).toContain('glowAt');
    expect(uniforms.uHalo.value.getHexString('srgb-linear')).toBe('ffb02e');
    expect(pass.material.depthTest).toBe(false);
    expect(uniforms.uNear.value).toBe(0.5);
    expect(uniforms.uFar.value).toBe(260);
    // Palette colours go in as raw sRGB, since the shader writes sRGB.
    expect(uniforms.uInk.value.getHexString('srgb-linear')).toBe('17151a');
    expect(uniforms.uPaper.value.getHexString('srgb-linear')).toBe('fffcf5');
  });

  it('sizes to the target in device pixels', () => {
    pass.setSize(1920, 1080, 1.5);
    expect(pass.material.uniforms.uRes.value.toArray()).toEqual([1920, 1080]);
    expect(pass.material.uniforms.uPx.value).toBe(1.5);
  });

  it('boils like hand-drawn animation: a few drawings, stepped a few times a second', () => {
    // A deliberate low-rate step (on threes to fives), never a per-frame reseed.
    expect(BOIL_FPS).toBeGreaterThanOrEqual(3);
    expect(BOIL_FPS).toBeLessThanOrEqual(8);
    expect(VARIANTS).toHaveLength(BOIL_VARIANTS);
    expect(BOIL_VARIANTS).toBeGreaterThanOrEqual(3);
    // It holds for a whole step, then moves to the next drawing, and cycles.
    const step = 1 / BOIL_FPS;
    for (const t of [0, 1.2, 37, 600]) {
      const at = Math.floor(t * BOIL_FPS) * step;
      expect(boilStep(at + step * 0.1)).toBe(boilStep(at + step * 0.9));
      expect(boilStep(at + step * 1.1)).toBe((boilStep(at + step * 0.5) + 1) % BOIL_VARIANTS);
    }
    expect(boilStep(BOIL_VARIANTS * step + step / 2)).toBe(boilStep(step / 2));
    expect(boilStep(-step / 2)).toBe(BOIL_VARIANTS - 1);
    // Each drawing is the same one nudged a little: strokes by under two of
    // their units (CSS pixels), the outline wobble by under a noise cell.
    for (const v of VARIANTS) {
      expect(Math.hypot(...v.strokes)).toBeLessThan(2);
      expect(Math.hypot(...v.wobble)).toBeLessThan(1);
    }
    const uniforms = pass.material.uniforms;
    for (let i = 0; i < BOIL_VARIANTS; i++) {
      pass.setBoil(i * step + step / 2);
      expect(uniforms.uBoilStrokes.value.toArray()).toEqual(VARIANTS[i].strokes);
      expect(uniforms.uBoilWobble.value.toArray()).toEqual(VARIANTS[i].wobble);
    }
    expect(uniforms.uWobble.value).toBe(WOBBLE_PX);
    expect(WOBBLE_PX).toBeLessThanOrEqual(2.5);
  });

  it('finds the surfaces from depth, so the strokes stay on them as the camera turns', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 0.4, 260);
    camera.position.set(3, 1.6, -2);
    camera.rotation.set(0.1, 0.7, 0);
    camera.updateMatrixWorld();
    pass.setCamera(camera);
    const uniforms = pass.material.uniforms;
    // The inverse of projection x view: a point projected and brought back lands where it was.
    const viewProj = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const p = new Vector3(4, 2, -12);
    const back = p.clone().applyMatrix4(viewProj).applyMatrix4(uniforms.uInvViewProj.value);
    expect(back.distanceTo(p)).toBeLessThan(1e-3);
    expect(uniforms.uTanHalf.value).toBeCloseTo(Math.tan(Math.PI / 6), 6);
    const shader = pass.material.fragmentShader;
    expect(shader).toContain('vec3 worldAt(vec2 uv)');
    // Triplanar on the surface's own normal, at two world-fixed scales cross-faded by distance.
    expect(shader).toContain('vec3 dx = dFdx(wp);');
    expect(shader).toContain('cross(dx, dy)');
    // The scale follows the pixel's footprint on the surface, so grazing surfaces don't alias.
    expect(shader).toContain('max(length(dx), length(dy))');
    expect(shader).toMatch(/exp2\(floor\(level\)\)/);
    expect(shader).toContain('marksOn(wp.zy');
    // A scale is drawn the same whether it's the finer or the coarser of the pair, so there's no seam where they swap.
    expect(shader).toContain('marks(p / scale0,');
    expect(shader).toContain('marks(p / (scale0 * 2.0),');
    // The strokes don't read the screen position any more; only the paper, wobble and bleed do.
    expect(shader).not.toMatch(/strokes\(css/);
  });

  it('has a lighter variant for phones and software renderers', () => {
    const lite = createCrayonPass({
      color: new DataTexture(),
      depth: new DataTexture(),
      near: 0.5,
      far: 260,
      lite: true,
    });
    expect(lite.material.defines).toEqual({ LITE: 1 });
    expect(pass.material.defines).toEqual({});
    expect(lite.material.fragmentShader).toContain('#ifdef LITE');
    lite.dispose();
  });

  it('keeps its grain finer than the pixels can show from aliasing into seams', () => {
    const shader = pass.material.fragmentShader;
    // An integer hash (no float-precision lattice), band-limited and tilted noise.
    expect(shader).toContain('uint pcg(uint v)');
    expect(shader).toMatch(/float band\(float cellsPerCss\) \{ return min\(cellsPerCss, 0\.45 \* uPx\); \}/);
    expect(shader).toMatch(/noise\(tilt\(css, [\d.]+\) \* band\(1\.9\)/);
  });

  it('cleans up', () => {
    pass.dispose();
  });
});
