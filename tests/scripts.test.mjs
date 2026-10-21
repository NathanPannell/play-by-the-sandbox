import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, publicDir } from '../scripts/build.mjs';
import { shouldBuild } from '../scripts/vercel-ignore.mjs';

/** @param {string} dir @returns {string[]} */
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .sort();

describe('build', () => {
  it('copies public/ to dist/ byte for byte and adds the hero bundle', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'pbts-build-')), 'dist');
    try {
      build(out);
      expect(files(out)).toEqual([...files(publicDir), 'hero.js'].sort());
      for (const f of files(publicDir)) {
        expect(readFileSync(join(out, f)).equals(readFileSync(join(publicDir, f))), f).toBe(true);
      }
      const hero = readFileSync(join(out, 'hero.js'), 'utf8');
      // One self-contained, minified ES module: three.js is bundled, nothing is imported at runtime.
      expect(hero).not.toMatch(/(^|[;}])\s*import[\s{*"'(]/);
      expect(hero).toContain('heroScene');
      expect(hero.length).toBeLessThan(800_000);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('vercel ignore step', () => {
  it.each(['main', 'staging'])('builds %s', (ref) => expect(shouldBuild(ref)).toBe(true));
  it('builds CLI deployments, which have no git ref', () => expect(shouldBuild(undefined)).toBe(true));
  it.each(['ci/pipeline', 'feat/x', 'dependabot/npm'])('skips %s, so there are no preview deployments', (ref) =>
    expect(shouldBuild(ref)).toBe(false),
  );

  // Vercel builds on exit 1 and skips on exit 0.
  /** @param {string} ref */
  const exitCode = (ref) =>
    spawnSync(process.execPath, ['scripts/vercel-ignore.mjs'], { env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref } })
      .status;
  it.each(['main', 'staging'])('exits 1 (build) for %s', (ref) => expect(exitCode(ref)).toBe(1));
  it('exits 0 (skip) for other branches', () => expect(exitCode('feat/x')).toBe(0));
});
