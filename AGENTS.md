# Play by the Sandbox

Event site for Play by the Sandbox, a creative event at the Vancouver Art Gallery in January 2027. It is one hand-written static page (`public/index.html`, with its CSS animations and scripts inline), a 360° three.js hero scene bundled from `src/hero/` into `hero.js`, and a Vercel function, `api/og.js`, that renders the 1200x630 share card with `@vercel/og`. Two application forms (`/apply/creator`, `/apply/brand`) store submissions in Neon Postgres, and the team reviews them at `/apply/review` (see "Application forms" below).

The repo was imported on 2026-10-21 from Vercel production deployment `dpl_HRayQz8pD3L1Yn7Q7mJfhFaHU7Vq`. Before that the site was deployed with the Vercel CLI and had no git history.

## Layout

| Path                        | What it is                                                                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/`                   | The site, served byte for byte. Don't reformat it: whitespace in `index.html` affects inline layout and the animations.                                    |
| `public/styles/tokens.css`  | The palette: every colour on the site as a CSS custom property. The /apply pages link it too.                                                              |
| `public/js/glove.js`        | The cartoon glove cursor (fine pointers only). Self-contained: injects its own CSS.                                                                        |
| `public/js/doodles.js`      | The doodle creatures, heading squiggles and Sandy the peeker. Self-contained: injects its own CSS.                                                         |
| `api/og.js`                 | `GET /api/og`, the Open Graph image. Fetches Chewy and Gaegu from Google Fonts at request time.                                                            |
| `src/apply/forms.js`        | The two application forms, one config object each. The single place to add, remove or reword fields.                                                       |
| `src/apply/`                | `validate.js` (shared by browser and server), `render.js` (the pages, at build time), `client.js` and `review-client.js` (browser).                        |
| `api/apply.js`              | `POST /api/apply`: validates and stores an application and its optional photo.                                                                             |
| `api/review.js`             | `GET`/`PATCH`/`DELETE /api/review`: the team's list, status changes and deletes. Needs the review secret.                                                  |
| `api/review-photo.js`       | `GET /api/review-photo?id=`: an application's photo. Needs the review secret.                                                                              |
| `api/_lib/`                 | Shared server code (not functions): the database pool and HTTP helpers.                                                                                    |
| `migrations/`               | Versioned SQL, applied in name order by `scripts/migrate.mjs`.                                                                                             |
| `public/apply/apply.css`    | Styles for the apply and review pages, with the palette as custom properties.                                                                              |
| `src/hero/`                 | The hero's 3D premiere scene (`scene.js`), the crayon post-process (`crayon.js`) and the DOM/WebGL entry (`main.js`).                                      |
| `scripts/build.mjs`         | Production build: copies `public/` to `dist/`, bundles `src/hero/main.js` into `dist/hero.js`, and renders and bundles the apply pages into `dist/apply/`. |
| `scripts/migrate.mjs`       | `npm run migrate`: applies `migrations/` to `DATABASE_URL`. Vercel runs it before every build.                                                             |
| `tools/make-poster.mjs`     | `npm run poster`: renders the still hero frame into `public/hero-poster.jpg` and `public/hero-poster-m.jpg`.                                               |
| `tools/make-icons.mjs`      | `npm run icons`: renders `public/logo.svg` (the "S" monogram) to the favicon, apple-touch and manifest PNGs.                                               |
| `tools/flicker.mjs`         | `npm run flicker`: graphics QA. Frame-to-frame change across a whole camera turn, camera turning and held, steady frames apart from boil steps.            |
| `tools/perf.mjs`            | `npm run perf`: draw calls, triangles, main-thread time and frame rate, mobile and desktop, CPU throttled 4x.                                              |
| `scripts/serve.mjs`         | Serves `dist/` and the `api/` functions locally, the way Vercel does. Without `DATABASE_URL` it uses an in-memory PGlite database. Used by the e2e suite.  |
| `scripts/vercel-ignore.mjs` | Vercel's ignored build step. Git deployments build only for `main` and `staging`.                                                                          |
| `tests/`                    | Vitest unit tests, with a coverage floor in `vitest.config.mjs`. The API tests run on PGlite.                                                              |
| `tests-db/`                 | `npm run test:db`: the same API tests and migration checks against a real Postgres (`TEST_DATABASE_URL`, CI's Database job).                               |
| `e2e/`                      | Playwright tests against the built site, on desktop and mobile Chrome.                                                                                     |

## Commands

```bash
npm ci
npm run format:check   # Prettier (public/ is excluded)
npm run lint           # ESLint, zero warnings, plus html-validate on index.html
npm run typecheck      # tsc --noEmit with checkJs
npm test               # Vitest with coverage floor
npm run build          # dist/
npm run e2e            # Playwright; builds and serves on 127.0.0.1:4321 (E2E_PORT to change it)
npm run migrate        # apply migrations/ to DATABASE_URL (does nothing without it)
npm run test:db        # API and migration tests against TEST_DATABASE_URL, after npm run migrate
npm run build && npm run serve   # local preview
npm run poster         # re-render the hero posters after changing the scene or its crayon (src/hero/crayon.js)
npm run icons          # re-render the PNG icons after changing public/logo.svg
npm run flicker        # graphics QA numbers (-- --save <dir>, --tier full|lite|software, --gpu)
npm run perf           # draw calls, triangles and frame times on the real GPU, CPU throttled 4x
```

Headless Chromium renders WebGL with SwiftShader (on the CPU) unless it is launched with `--use-angle=d3d11 --enable-gpu --ignore-gpu-blocklist` (Windows). The hero then picks its software tier, so QA either passes `--gpu` or forces a tier with `?hero-debug&hero-tier=…`.

html-validate turns off three stylistic rules (`attr-quotes`, `doctype-style`, `no-inline-style`), because the page uses single-quoted attributes and inline styles throughout. Every structural rule still applies.

## Logo

- The logo is the crayon-stroke wordmark, `public/wordmark.svg` (the designer's file). It is inlined in `index.html` three times: the header link (on its own, `role="img"`, `aria-label="Sandbox"`), the hero card's title (hidden from screen readers, with a visually hidden "Sandbox" so the heading reads "Play by the Sandbox"), and the footer. The purple "o" is drawn as one stroked ring instead of the file's filled circle with a white hole, so it can draw in like the other letters and shows the paper through it.
- All three share one filter, `#wmWobble`, in the page's hidden `<defs>`. Each letter draws in once (`.wm-s`, the `sbDraw` keyframes; the footer's waits until it scrolls into view). After that a small inline script, about 15 times a second, drifts the filter's noise (`#wmDrift`, an `feOffset`) and gives each letter a gentle sine wiggle. It only runs while a wordmark is on screen and the tab is visible. Under `prefers-reduced-motion` the wordmarks are drawn and still.
- Tiny icons can't fit the whole word, so they use a monogram: the wordmark's red "S" on the brand's yellow disc with an ink ring (`public/logo.svg`, rendered to PNG by `npm run icons`). The share card (`api/og.js`) carries the wordmark as plain strokes (no filter) under the "Play by the" ribbon. Its URL is versioned (`/api/og?v=3`); bump the version when the card changes, so social caches refresh.

## Palette and type

- The palette lives in `public/styles/tokens.css` and nowhere else: soft pastels (`--rose`, `--peach`, `--butter`, `--mint`, `--sky`, `--lilac`) for fills, `-wash` tints for big backgrounds, and `-ink` shades for coloured text, all on `--paper` with plum-charcoal `--ink` lines. `index.html` uses `var(--…)` everywhere except the wordmark's letter colours (the designer's file), the hero's dark backdrop, the `theme-color` meta and the footer's link block, whose inline colours are overridden from the stylesheet (`footer div>a.hand`) so that block stays easy to merge. Text colours are AA on `--paper` and `--card`; on the pastel fills use `--ink` or `--ink-soft`. `e2e/crayon.spec.mjs` checks the computed text colour of every piece of text against its background (before the crayon grain, which thins headings a little; they are large text with room to spare).
- Type is hand-lettered with solid fills, never textured: the owner found crayon grain on text and buttons too busy. `--font-display` (Gochi Hand) sets headings (`.toon`, with a lighter pass of the same colour as their shadow), buttons and the Apply chip; `--font-body` (Patrick Hand) sets reading text, labels, chips, fields and helper text. Both come from Google Fonts with `display=swap` and are defined in `tokens.css`; each has a single weight, so don't ask for bold (`font-synthesis-weight: none` stops the browser faking one; the apply pages show `<strong>` as a butter highlight). No wide letter-spacing. The crayon texture stays on the drawings: the wordmark (`#wmWobble`), the hero, the SVG illustrations (`.crayon`, `#crayon`) and the glove (`#crayonSoft`, kept in the page's `<defs>` for it). The home page still loads Chewy because the hero canvas letters its speech bubble and slides with it.

## Glove cursor and doodles

- `glove.js` draws an old rubber-hose, four-finger white glove that follows the mouse with a slight lag and lean: an open hand over the page, pointing over links, buttons and drop-down options, holding a crayon over text fields (its tip is the hotspot, so there's no I-beam on top of it), and a squashed grab while pressed. It stays on everywhere a page can draw, including form fields and the file picker's button; only the root scrollbars and iframes get the native cursor back, because no page cursor can cover them. It only runs for `(pointer: fine)` without `prefers-reduced-motion`, hides for touch input, and never takes pointer events. Its frame loop stops as soon as the glove settles.
- `doodles.js` gives each section a resident (crab, film-slate snail, gull, bouncy ball, rubber duck, mole in sunglasses) that turns up when it scrolls into view, draws a squiggle under each section heading, and, once the visitor is past the hero, has Sandy the sand critter peek in from an edge every 30 to 50 seconds (at most 8 times). IntersectionObservers drive the arrivals and run each creature's idle loop only while it is on screen; Sandy waits on timers, never a scroll handler, and ducks out of sight as soon as the hero comes back into view, the tab is hidden or reduced motion is turned on. Everything is `aria-hidden` and `pointer-events: none`. Under reduced motion the creatures are drawn still and Sandy stays home. `/?doodle-debug` makes Sandy's first peek come right away.

## Hero layout

The hero is a fullscreen 360° scene (`100dvh`, with `100svh` and `100vh` fallbacks). The page sections follow below it. The scene itself is sized to the large viewport (`100lvh`), so a phone's address bar coming and going never resizes the canvas. Everything else sits on top of it as small paper inlays (`.hud`):

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
- The crayon is on the models, not over the screen: there is no full-screen pass, the scene renders straight to the canvas (with the canvas's own multisampling where the tier has it). `src/hero/crayon.js` makes one small stroke texture at load (`crayonTexture`, 256², no download): rows of tapered, overlapping wax strokes with paper between, the paper's tooth breaking them up, and four slightly redrawn versions of the same strokes in its four channels. `createCrayon().apply(scene)` patches every opaque Lambert and basic material (`onBeforeCompile`) to sample it triplanar in the mesh's own object space, so the strokes stick to the surface and move with it, `STROKE_TILE` metres a tile. Each face orientation turns the strokes its own way, as if coloured in by hand, and a much bigger, mip-blurred sample of the same texture varies the pressure in broad patches and keeps big walls from showing the tile. The wax takes the material's own colour (vertex and instance colours included); the gaps are a pale tint of it, lit like the rest of the surface. Mipmaps and anisotropic filtering stop distant and grazing surfaces from shimmering. Phones (`CRAYON_LITE`) sample only the plane a surface faces most. Light sources and additive beams are left alone.
- Ink outlines are inverted hulls: back faces pushed out along smoothed normals (`hullGeometry` welds the corners so the hull closes) by `OUTLINE_PX` CSS pixels on screen, wavering a little along their length, faded by the fog. `Batch` builds a mesh's hull from its solid parts only (`userData.hull`; flat shapes like bunting have no inside), the crowd's instanced solids get hulls that share their instance matrices (`userData.outline`), and all scenery that never moves (`userData.still`) shares one merged hull, so the outlines cost a handful of draw calls. `e2e/hero.spec.mjs` checks the marks move with the scene when the camera turns.
- The boil: like hand-drawn animation, the drawing steps through its `BOIL_VARIANTS` (4) redrawn versions `BOIL_FPS` (5) times a second (`boilStep` in `crayon.js`): one shared uniform picks the texture channel for every material, and the outline jitter steps with it. A paused or reduced-motion frame holds one. The flicker QA tells "steady" frames (all inside one boil step) from boil frames (across a step): steady frames must not flicker at all, which is what catches anything per-frame or high-frequency, and boil frames may change by a redraw's worth.
- Things that keep it from flickering, and must stay that way: multisampled rendering (4x on desktop, the canvas default on phones); the stroke texture is mipmapped and anisotropic and only changes in boil steps; lights fade rather than switch (marquee chase, flashes with a rise and decay, the ad screen's slide changes); confetti grows in and out of sight; decals sit clearly proud of the surfaces under them.
- Light sources (the SANDBOX marquee, camera flashes) use `glowMaterial()` from `scene.js`: full colour warmed toward white, no strokes and no outline. Custom shaders (`glowMaterial`, the sky, the ad screen) end with `#include <colorspace_fragment>`, since they draw straight to the sRGB canvas.
- Phones (`pickQuality` in `src/hero/quality.js`) get a smaller crowd, fewer particles, three searchlights, still influencers merged into one mesh, a skyline without windows, a lighter crayon (`CRAYON_LITE`: one projection plane), the canvas's own antialiasing, a device pixel ratio capped at 1.25 and about 30 fps. On top of that, `adaptScale` lowers the render scale by 15% at a time when drawn frames run more than 30% over budget for a two-second window, and raises it back after three calm windows. If dropping to the floor doesn't speed frames up, the display is capping the frame rate (Low Power Mode, Energy Saver), so the scale goes back to 1 and adapting stops. The page's `#heroScene` carries the current `data-scale`. Software WebGL (SwiftShader, llvmpipe, Microsoft Basic Render Driver; this is also what CI's headless Chromium uses) gets the same small scene at 0.6x resolution, without antialiasing, at about 20 fps. The device pixel ratio is capped at 1.5.
- `three` and `esbuild` are in `dependencies`, not `devDependencies`, because Vercel installs with `npm ci --omit=dev` and then runs the build.
- `npm install` with npm 11 on Windows has dropped rolldown's and lightningcss's optional platform packages from `package-lock.json`, which breaks `npm ci` elsewhere. After changing dependencies, check that `"node_modules/@rolldown/binding-linux-x64-gnu"` is still in the lockfile.

## Hosting

- Vercel project `play-by-the-sandbox` (`prj_ejBMjqhQA8euAySrRdacoWEalmAY`), team `nathanpannells-projects` (`team_CJ0RWNsNJK6vDQy2raakV6cZ`). It's connected to this repo through the Vercel GitHub integration, and the production branch is `main`.
- Production: `playbythesandbox.ca` and `www.playbythesandbox.ca`.
- Staging: `staging.playbythesandbox.ca`, bound to git branch `staging`.
- DNS is on Vercel, the registrar.
- Database: Neon project `play-by-the-sandbox` (`fragrant-salad-80023133`, aws-us-east-1 next to the functions' `iad1`, Postgres 17), database `sandbox`, role `sandbox_app`. Branch `production` (default) serves `main`, branch `staging` serves `staging`; the staging role has its own password. Computes are 0.25 CU with a 300 s suspend timeout. Nothing polls the database: queries happen only on `/api/apply` and the review endpoints, and idle pool connections close after 5 s.
- Environment variables (Vercel, encrypted): `DATABASE_URL` and `REVIEW_SECRET`, each set for Production and for Preview on git branch `staging`. Optional: `APPLY_RATE_LIMIT` (applications per address per hour, default 8) and `APPLY_DAILY_CAP` (applications from everyone per day, default 1000).
- The Vercel MCP connector has no grant for this team. Use the Vercel CLI, which is logged in as `nathanpannell`. For raw API calls, use `npx -y vercel@latest api <path>`, because the installed 50.1.3 CLI lacks `vercel api`.

## Application forms

- `/apply/creator` and `/apply/brand` are static pages rendered at build time from `src/apply/forms.js`. Like the home page, they link `/styles/tokens.css` (no colours of their own in `public/apply/apply.css`), use the same two hand-lettering fonts with no texture on text, and load the glove cursor (with an inline copy of its `#crayonSoft` filter, `src/apply/render.js`). To change a form, edit its config there: fields, labels, hints, options, limits and sections. Answers are stored as JSON keyed by field name, so field changes need no migration, but don't rename a field that already has submissions. The home page's "Grab a toy" section (`#toys`) leads to them: two toys, Brands (picked to start with) and Creators, whose button (`#roleCta`) goes to `/apply/brand` or `/apply/creator`. The roles live in the `roles` array in the page's inline script.
- The forms and the review page have no native drop-downs on screen: `src/apply/listbox.js` turns each `<select>` into a pastel select-only combobox (WAI-ARIA APG: arrows, Home/End, Enter/Space, Esc, Tab, Alt+arrows and type-ahead). An OS select list can't show the glove and ignores the palette. The select stays in the form, hidden, holding the value: forms submit it, scripts read `select.value`, and choosing fires `input` and `change` on it. Its `aria-invalid` and `aria-describedby` are mirrored onto the combobox. Link rows added later are enhanced as they're added.
- The browser checks answers with the same `validate()` the server uses, shrinks photos over 1.5 MB to 1600 px JPEGs, and sends `multipart/form-data` to `/api/apply`. The server is the real check: lengths, emails, links (an @handle becomes the profile URL), options, the photo's type from its bytes (JPEG, PNG, WebP, GIF) and size (4 MB, under Vercel's 4.5 MB body limit), a `nickname` honeypot, a rate limit per address (IPv6 counted by its /64) and a daily cap for everyone. The count and the insert share one transaction under an advisory lock per address, so parallel requests can't slip past the limit. Addresses are stored only as an HMAC keyed with `REVIEW_SECRET`, so `/api/apply` stays closed (503) on a deployment without that secret.
- Storage: table `applications` (one row per application, `status` new, shortlisted or declined) and `application_photos` (the image bytes, kept apart so listing never reads them). Photos are served only through `/api/review-photo` with the review secret, never publicly.
- `/apply/review` (noindex, and disallowed in `robots.txt`) asks for the review password, which is the `REVIEW_SECRET` env var for that environment (read it in the Vercel project settings). It lists applications newest first with photo, links and answers, filters by kind and status, sets the status, and deletes (for spam and tests).
- Migrations: add a new numbered file to `migrations/`; never edit one that has shipped. `npm run migrate` runs them in one transaction under an advisory lock. Vercel's build command runs it first, so a deploy migrates its own Neon branch, and a deploy without `DATABASE_URL` fails.

## Delivery

Follow `C:\repo\AGENTS.md` and the `deliver` skill: draft PR to `staging`, the full CI gate (`.github/workflows/ci.yml`), review, then squash-merge. Merges deploy on their own:

- A merge to `staging` makes Vercel build that commit, and it is served at `staging.playbythesandbox.ca`.
- A merge to `main` makes a production deployment on `playbythesandbox.ca`. Open the `staging` → `main` PR only when the user asks, and merge it only with their approval.
- Only `staging` and `main` create Vercel deployments. `git.deploymentEnabled` in `vercel.json` stops Vercel from creating one for any other branch, because even a canceled deployment counts toward the Hobby plan's 100-per-day limit. `scripts/vercel-ignore.mjs` stays as a second guard, so there are no preview deployments.

GitHub branch protection and rulesets need GitHub Pro for private repos, so they're off. The merge rule in the `deliver` skill is the gate: every check is green on the head SHA.

After a staging merge, wait for the READY deployment of the merge SHA (`vercel ls play-by-the-sandbox --scope nathanpannells-projects`, or the commit's Vercel status). Then confirm `https://staging.playbythesandbox.ca/` and `/api/og` serve that commit's content.

## Known issues

- `api/og.js` intends to fall back to a system font when Google Fonts is unreachable. However, it passes an empty `fonts` array, so Satori throws "No fonts are loaded" and the endpoint returns 500. `tests/og.test.mjs` pins this current behaviour.
