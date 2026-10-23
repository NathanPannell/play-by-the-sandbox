// Renders public/logo.svg (the crayon "S" monogram from the wordmark) to the
// PNG icons: favicon-48.png, apple-touch-icon.png (180), icon-192.png and
// icon-512.png. Re-run after changing the logo, and commit the images.
//
//   npm run icons
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const file = (/** @type {string} */ name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const svg = readFileSync(file('logo.svg'), 'utf8');

// iOS fills transparency with black, so the apple-touch icon sits on paper.
const icons = [
  ['favicon-48.png', 48, null],
  ['apple-touch-icon.png', 180, '#FFFCF5'],
  ['icon-192.png', 192, null],
  ['icon-512.png', 512, null],
];

const browser = await chromium.launch();
try {
  for (const [name, size, paper] of /** @type {[string, number, string | null][]} */ (icons)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:${paper ?? 'transparent'}}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.locator('svg').screenshot({ path: file(name), omitBackground: !paper });
    console.log(name, `${size}x${size}`);
    await page.close();
  }
} finally {
  await browser.close();
}
