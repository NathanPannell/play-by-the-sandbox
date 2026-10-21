import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
  it('copies public/ to dist/ byte for byte', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'pbts-build-')), 'dist');
    try {
      build(out);
      expect(files(out)).toEqual(files(publicDir));
      for (const f of files(publicDir)) {
        expect(readFileSync(join(out, f)).equals(readFileSync(join(publicDir, f))), f).toBe(true);
      }
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
});
