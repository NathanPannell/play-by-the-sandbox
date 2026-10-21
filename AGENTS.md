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
npm run flicker        # graphics QA numbers (add -- --save <dir> to keep a frame per run)
```

html-validate turns off three stylistic rules (`attr-quotes`, `doctype-style`, `no-inline-style`), because the page uses single-quoted attributes and inline styles throughout. Every structural rule still applies.

## Logo

- The logo is the crayon-stroke wordmark, `public/wordmark.svg` (the designer's file). It is inlined in `index.html` three times: the header link (on its own, `role="img"`, `aria-label="Sandbox"`), the hero card's title (hidden from screen readers, with a visually hidden "Sandbox" so the heading reads "Play by the Sandbox"), and the footer. The purple "o" is drawn as one stroked ring instead of the file's filled circle with a white hole, so it can draw in like the other letters and shows the paper through it.
- All three share one filter, `#wmWobble`, in the page's hidden `<defs>`. Each letter draws in once (`.wm-s`, the `sbDraw` keyframes; the footer's waits until it scrolls into view). After that a small inline script, about 15 times a second, drifts the filter's noise (`#wmDrift`, an `feOffset`) and gives each letter a gentle sine wiggle. It only runs while a wordmark is on screen and the tab is visible. Under `prefers-reduced-motion` the wordmarks are drawn and still.
- Tiny icons can't fit the whole word, so they use a monogram: the wordmark's red "S" on the brand's yellow disc with an ink ring (`public/logo.svg`, rendered to PNG by `npm run icons`). The share card (`api/og.js`) carries the wordmark as plain strokes (no filter) under the "Play by the" ribbon. Its URL is versioned (`/api/og?v=3`); bump the version when the card changes, so social caches refresh.

## Hero scene

- The camera stands on the red carpet at eye height (`EYE` in `scene.js`) and turns a full circle every 75 seconds (`REVOLUTION`), forever. The whole camera path, bob included, repeats exactly every turn, so the loop has no seam. Around the viewer: the gallery, steps and SANDBOX marquee (north), the photo wall, projector tower and big ad screen (east), the balloon arch, paparazzi, limos and the shops and hotel across Georgia St (south), and Robson Square's terraces, fountain and activation tents (west), with a skyline, the North Shore mountains, searchlights and confetti all round.
- `#heroScene` holds the poster image and, once `hero.js` runs, the WebGL canvas. Its `data-state` is `poster`, `running`, `paused` (tab hidden or hero off-screen), `static` (prefers-reduced-motion: one still frame) or `fallback` (no WebGL2, so the poster stays). The canvas's `data-frames` counts rendered frames; the e2e suite reads both.
- The scene is a pure function of time (`update(t, cameraT = t)`). The reduced-motion still and the posters use the same moment (`STILL_T`, facing the gallery), so re-running `npm run poster` after a scene change keeps them matching.
- Graphics QA: `/?hero-debug` exposes `window.__hero.draw(t, cameraT)`, which stops the loop and draws any moment exactly, optionally with the camera held at another time. `npm run flicker` and the e2e flicker check use it.
- Things that keep it from flickering, and must stay that way: the scene renders into a multisampled target (4x on desktop, 2x on phones); the crayon pass's grain and strokes are fixed to the screen, its posterise and coverage are soft, and its "boil" is a slow drift of the outline wobble (`BOIL_SPEED`, at most `WOBBLE_PX`), never a reseed; lights fade rather than switch (marquee chase, flashes with a rise and decay, the ad screen's slide changes); confetti grows in and out of sight; decals sit clearly proud of the surfaces under them.
- Light sources (the SANDBOX marquee) use `glowMaterial()` from `scene.js`, which writes alpha 0 into the render target. The crayon pass draws those pixels at full colour with no ink and puts a hatched halo around them. Every other material must keep writing alpha 1.
- Phones (`pickQuality` in `src/hero/quality.js`) get a smaller crowd, fewer particles, three searchlights, 2x antialiasing and about 30 fps. The device pixel ratio is capped at 1.5.
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
