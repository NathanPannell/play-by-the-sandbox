// Production build: copies public/ to dist/ unchanged, then bundles the hero
// scene (src/hero/main.js, with three.js) into dist/hero.js. Vercel serves
// dist/ (see vercel.json) and builds the api/ functions separately.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

export const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
export const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
export const heroEntry = fileURLToPath(new URL('../src/hero/main.js', import.meta.url));

export function build(outDir = distDir) {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(publicDir, outDir, { recursive: true });
  buildSync({
    entryPoints: [heroEntry],
    outfile: `${outDir}/hero.js`,
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    legalComments: 'eof',
    logLevel: 'warning',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build();
  console.log('Built dist/');
}
