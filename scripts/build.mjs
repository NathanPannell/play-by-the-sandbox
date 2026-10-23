// Production build: copies public/ to dist/ unchanged, then bundles the hero
// scene (src/hero/main.js, with three.js) into dist/hero.js, and renders the
// apply pages and the review page from src/apply/ (their scripts go to
// dist/apply/). Vercel serves dist/ (see vercel.json) and builds the api/
// functions separately.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { FORMS } from '../src/apply/forms.js';
import { renderApplyPage, renderReviewPage } from '../src/apply/render.js';

export const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
export const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
export const heroEntry = fileURLToPath(new URL('../src/hero/main.js', import.meta.url));
const applyClient = fileURLToPath(new URL('../src/apply/client.js', import.meta.url));
const reviewClient = fileURLToPath(new URL('../src/apply/review-client.js', import.meta.url));

/** The pages rendered from src/apply/, by path under dist/. */
export const applyPages = {
  'apply/creator/index.html': () => renderApplyPage(FORMS.creator),
  'apply/brand/index.html': () => renderApplyPage(FORMS.brand),
  'apply/review/index.html': renderReviewPage,
};

/** @param {string} entry @param {string} outfile */
const bundle = (entry, outfile) =>
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    legalComments: 'eof',
    logLevel: 'warning',
  });

export function build(outDir = distDir) {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(publicDir, outDir, { recursive: true });
  bundle(heroEntry, `${outDir}/hero.js`);
  bundle(applyClient, `${outDir}/apply/apply.js`);
  bundle(reviewClient, `${outDir}/apply/review.js`);
  for (const [path, render] of Object.entries(applyPages)) {
    mkdirSync(`${outDir}/${path.replace(/\/[^/]+$/, '')}`, { recursive: true });
    writeFileSync(`${outDir}/${path}`, render());
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build();
  console.log('Built dist/');
}
