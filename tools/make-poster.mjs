// Renders the hero's still crayon frame (the one prefers-reduced-motion shows)
// in headless Chromium and saves it as the poster that stands in for the scene
// before the script loads and when WebGL is unavailable:
// public/hero-poster.jpg (desktop) and public/hero-poster-m.jpg (phones).
//
//   npm run poster
//
// Re-run it after changing the scene or its crayon (src/hero/crayon.js), and commit the images.
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from '../scripts/build.mjs';
import { startServer } from '../scripts/serve.mjs';

const PORT = 4399;
const out = (/** @type {string} */ name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

const shots = [
  // Desktop: the hero fills a 1600x900 viewport, saved at 1280x720.
  { file: 'hero-poster.jpg', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 0.8, isMobile: false },
  { file: 'hero-poster-m.jpg', viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, isMobile: true },
];

build();
const server = /** @type {import('node:http').Server} */ (await startServer(PORT));
const browser = await chromium.launch();
try {
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.deviceScaleFactor,
      isMobile: shot.isMobile,
      hasTouch: shot.isMobile,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    // Force the tier the poster stands in for: headless Chromium renders with
    // SwiftShader, which would otherwise get the software tier's low resolution.
    await page.goto(`http://127.0.0.1:${PORT}/?hero-debug&hero-tier=${shot.isMobile ? 'lite' : 'full'}`);
    await page.locator('#heroScene[data-state="static"].ready').waitFor();
    // Let the fonts and the projector's slides land, then the canvas fade finish.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    await page.addStyleTag({ content: '.hud,.hud-scrim,.hud-callout{display:none!important}' });
    const hero = page.locator('#heroScene');
    await hero.screenshot({ path: out(shot.file), type: 'jpeg', quality: 66 });
    const box = await hero.boundingBox();
    console.log(`${shot.file}: ${box?.width}x${box?.height} css px at ${shot.deviceScaleFactor}x`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
