// Production build: the site is hand-written static files, so the build copies
// public/ to dist/ unchanged. Vercel serves dist/ (see vercel.json) and builds
// the api/ functions separately.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
export const distDir = fileURLToPath(new URL('../dist/', import.meta.url));

export function build(outDir = distDir) {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(publicDir, outDir, { recursive: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build();
  console.log('Built dist/');
}
