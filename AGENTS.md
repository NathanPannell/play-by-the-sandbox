# Play by the Sandbox

Event site for Play by the Sandbox, a creative event at the Vancouver Art Gallery in January 2027. It is one hand-written static page (`public/index.html`, with its CSS animations and scripts inline), a 360° three.js hero scene bundled from `src/hero/` into `hero.js`, and a Vercel function, `api/og.js`, that renders the 1200x630 share card with `@vercel/og`.

The repo was imported on 2026-10-21 from Vercel production deployment `dpl_HRayQz8pD3L1Yn7Q7mJfhFaHU7Vq`. Before that the site was deployed with the Vercel CLI and had no git history.

## Layout

| Path                        | What it is                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `public/`                   | The site, served byte for byte. Don't reformat it: whitespace in `index.html` affects inline layout and the animations. |
| `api/og.js`                 | `GET /api/og`, the Open Graph image. Fetches Chewy and Gaegu from Google Fonts at request time.                         |
| `src/hero/`                 | The hero's 3D premiere scene (`scene.js`), the crayon post-process (`crayon.js`) and the DOM/WebGL entry (`main.js`).   |
| `scripts/build.mjs`         | Production build: copies `public/` to `dist/`, then bundles `src/hero/main.js` with esbuild into `dist/hero.js`.        |
| `tools/make-poster.mjs`     | `npm run poster`: renders the still crayon frame into `public/hero-poster.jpg` and `public/hero-poster-m.jpg`.          |
| `tools/make-icons.mjs`      | `npm run icons`: renders `public/logo.svg` (the "S" monogram) to the favicon, apple-touch and manifest PNGs.            |
| `tools/flicker.mjs`         | `npm run flicker`: graphics QA. Measures frame-to-frame change across a whole camera turn, camera turning and held.     |
| `tools/seams.mjs`           | `npm run seams`: checks the crayon paper for tiling seams at several pixel ratios (autocorrelation of flat paper).      |
| `tools/perf.mjs`            | `npm run perf`: draw calls, triangles, main-thread time and frame rate, mobile and desktop, CPU throttled 4x.           |
| `scripts/serve.mjs`         | Serves `dist/` and `api/og` locally, the way Vercel does. Used by the e2e suite.                                        |
| `scripts/vercel-ignore.mjs` | Vercel's ignored build step. Git deployments build only for `main` and `staging`.                                       |
| `tests/`                    | Vitest unit tests, with a coverage floor in `vitest.config.mjs`.                                                        |
| `e2e/`                      | Playwright tests against the built site, on desktop and mobile Chrome.                                                  |

## Commands

```bash
npm ci
npm run format:check   # Prettier (public/ is excluded)
npm run lint           # ESLint, zero warnings, plus html-validate on index.html
npm run typecheck      # tsc --noEmit with checkJs
npm test               # Vitest with coverage floor
npm run build          # dist/
npm run e2e            # Playwright; builds and serves on 127.0.0.1:4321
npm run build && npm run serve   # local preview
npm run poster         # re-render the hero posters after changing the scene or the crayon pass
npm run icons          # re-render the PNG icons after changing public/logo.svg
npm run flicker        # graphics QA numbers (-- --save <dir>, --tier full|lite|software, --gpu)
npm run seams          # tiling-seam check on the real GPU
npm run perf           # draw calls, triangles and frame times on the real GPU, CPU throttled 4x
```

Headless Chromium renders WebGL with SwiftShader (on the CPU) unless it is launched with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` (Windows). The hero then picks its software tier, so QA either passes `--gpu` or forces a tier with `?hero-debug&hero-tier=…`.

html-validate turns off three stylistic rules (`attr-quotes`, `doctype-style`, `no-inline-style`), because the page uses single-quoted attributes and inline styles throughout. Every structural rule still applies.

## Logo

- The logo is the crayon-stroke wordmark, `public/wordmark.svg` (the designer's file). It is inlined in `index.html` three times: the header link (on its own, `role="img"`, `aria-label="Sandbox"`), the hero card's title (hidden from screen readers, with a visually hidden "Sandbox" so the heading reads "Play by the Sandbox"), and the footer. The purple "o" is drawn as one stroked ring instead of the file's filled circle with a white hole, so it can draw in like the other letters and shows the paper through it.
- All three share one filter, `#wmWobble`, in the page's hidden `<defs>`. Each letter draws in once (`.wm-s`, the `sbDraw` keyframes; the footer's waits until it scrolls into view). After that a small inline script, about 15 times a second, drifts the filter's noise (`#wmDrift`, an `feOffset`) and gives each letter a gentle sine wiggle. It only runs while a wordmark is on screen and the tab is visible. Under `prefers-reduced-motion` the wordmarks are drawn and still.
- Tiny icons can't fit the whole word, so they use a monogram: the wordmark's red "S" on the brand's yellow disc with an ink ring (`public/logo.svg`, rendered to PNG by `npm run icons`). The share card (`api/og.js`) carries the wordmark as plain strokes (no filter) under the "Play by the" ribbon. Its URL is versioned (`/api/og?v=3`); bump the version when the card changes, so social caches refresh.

## Hero layout

The hero is a fullscreen 360° scene (`100dvh`, with `100svh` and `100vh` fallbacks). The page sections follow below it. The scene itself is sized to the large viewport (`100lvh`), so a phone's address bar coming and going never resizes the canvas or re-allocates its render target. Everything else sits on top of it as small paper inlays (`.hud`):

- top left: the "Play by the" ribbon and the wordmark (the page's `h1`), with "January 2027 · Vancouver Art Gallery";
- top right: nav chips with letter shortcuts (H, R, T, W) and a yellow Apply chip (A). On phones the links fold into a Menu chip, and Apply stays out. Shortcuts are ignored while typing in a field or with a modifier held;
- bottom left: "I wanna play" and the pause/play control (P). The scene turns forever, so this is the WCAG 2.2.2 control. Under reduced motion the scene starts still and Play starts it;
- bottom right: a scroll cue (desktop);
- in the scene: a speech bubble (`#heroCallout`) that `hero.js` keeps under the marquee's corner while the sign is in view.

The shortcuts can be turned off from the footer ("Turn off keyboard shortcuts", remembered in `localStorage`), for WCAG 2.1.4. The pause control only shows once the scene is running. Every inlay control is at least 44px tall, and a light scrim at the top and bottom keeps the chips legible over any angle.

## Hero scene

- The camera stands on the red carpet at eye height (`EYE` in `scene.js`) and turns a full circle every 75 seconds (`REVOLUTION`), forever. The whole camera path, bob included, repeats exactly every turn, so the loop has no seam. Around the viewer: the gallery, steps and SANDBOX marquee (north), the photo wall, projector tower and big ad screen (east), the balloon arch, paparazzi, limos and the shops and hotel across Georgia St (south), and Robson Square's terraces, fountain and activation tents (west), with a skyline, the North Shore mountains, searchlights and confetti all round.
- `#heroScene` holds the poster image and, once `hero.js` runs, the WebGL canvas. Its `data-state` is `poster`, `running`, `paused` (tab hidden or hero off-screen), `static` (prefers-reduced-motion: one still frame) or `fallback` (no WebGL2, so the poster stays). The canvas's `data-frames` counts rendered frames; the e2e suite reads both.
- The scene is a pure function of time (`update(t, cameraT = t)`). The reduced-motion still and the posters use the same moment (`STILL_T`, facing the gallery), so re-running `npm run poster` after a scene change keeps them matching.
- Graphics QA: `/?hero-debug` exposes `window.__hero.draw(t, cameraT)`, which stops the loop and draws any moment exactly, optionally with the camera held at another time. `npm run flicker` and the e2e flicker check use it.
- Seams: the crayon noise uses an integer hash (PCG). The old float hash, `fract(p * 234.34)`, repeated every 50 lattice cells (0.34 × 50 is whole), which showed as a grain that tiled every 39 CSS px. Every noise octave is also capped below half a cell per device pixel (`band()`), and the grain lives in a rotated copy of the plane (`tilt()`), so it can't alias into a moiré at any pixel ratio. The e2e seam check and `npm run seams` guard this.
- Things that keep it from flickering, and must stay that way: the scene renders into a multisampled target (4x on desktop, 2x on phones); the crayon pass's grain and strokes are fixed to the screen, its posterise and coverage are soft, and its "boil" is a slow drift of the outline wobble (`BOIL_SPEED`, at most `WOBBLE_PX`), never a reseed; lights fade rather than switch (marquee chase, flashes with a rise and decay, the ad screen's slide changes); confetti grows in and out of sight; decals sit clearly proud of the surfaces under them.
- Light sources (the SANDBOX marquee) use `glowMaterial()` from `scene.js`, which writes alpha 0 into the render target. The crayon pass draws those pixels at full colour with no ink and puts a hatched halo around them. Every other material must keep writing alpha 1.
- Phones (`pickQuality` in `src/hero/quality.js`) get a smaller crowd, fewer particles, three searchlights, still influencers merged into one mesh, a skyline without windows, a lighter crayon pass (`LITE`: one halo ring, four-neighbour depth edges), 2x antialiasing, a device pixel ratio capped at 1.25 and about 30 fps. On top of that, `adaptScale` lowers the render scale by 15% at a time when drawn frames run more than 30% over budget for a two-second window, and raises it back after three calm windows. If dropping to the floor doesn't speed frames up, the display is capping the frame rate (Low Power Mode, Energy Saver), so the scale goes back to 1 and adapting stops. The page's `#heroScene` carries the current `data-scale`. Software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render Driver; this is also what CI's headless Chromium uses) gets the same small scene at 0.6x resolution, without antialiasing, at about 20 fps. The device pixel ratio is capped at 1.5.
- `three` and `esbuild` are in `dependencies`, not `devDependencies`, because Vercel installs with `npm ci --omit=dev` and then runs the build.
- `npm install` with npm 11 on Windows has dropped rolldown's and lightningcss's optional platform packages from `package-lock.json`, which breaks `npm ci` elsewhere. After changing dependencies, check that `"node_modules/@rolldown/binding-linux-x64-gnu"` is still in the lockfile.

## Hosting

- Vercel project `play-by-the-sandbox` (`prj_ejBMjqhQA8euAySrRdacoWEalmAY`), team `nathanpannells-projects` (`team_CJ0RWNsNJK6vDQy2raakV6cZ`). It's connected to this repo through the Vercel GitHub integration, and the production branch is `main`.
- Production: `playbythesandbox.ca` and `www.playbythesandbox.ca`.
- Staging: `staging.playbythesandbox.ca`, bound to git branch `staging`.
- DNS is on Vercel, the registrar. There is no database and there are no environment variables.
- The Vercel MCP connector has no grant for this team. Use the Vercel CLI, which is logged in as `nathanpannell`. For raw API calls, use `npx -y vercel@latest api <path>`, because the installed 50.1.3 CLI lacks `vercel api`.

## Delivery

Follow `C:\repo\AGENTS.md` and the `deliver` skill: draft PR to `staging`, the full CI gate (`.github/workflows/ci.yml`), review, then squash-merge. Merges deploy on their own:

- A merge to `staging` makes Vercel build that commit, and it is served at `staging.playbythesandbox.ca`.
- A merge to `main` makes a production deployment on `playbythesandbox.ca`. Open the `staging` → `main` PR only when the user asks, and merge it only with their approval.
- Pushes to any other branch reach Vercel, but `scripts/vercel-ignore.mjs` cancels them, so there are no preview deployments.

GitHub branch protection and rulesets need GitHub Pro for private repos, so they're off. The merge rule in the `deliver` skill is the gate: every check is green on the head SHA.

After a staging merge, wait for the READY deployment of the merge SHA (`vercel ls play-by-the-sandbox --scope nathanpannells-projects`, or the commit's Vercel status). Then confirm `https://staging.playbythesandbox.ca/` and `/api/og` serve that commit's content.

## Known issues

- `api/og.js` intends to fall back to a system font when Google Fonts is unreachable. However, it passes an empty `fonts` array, so Satori throws "No fonts are loaded" and the endpoint returns 500. `tests/og.test.mjs` pins this current behaviour.
