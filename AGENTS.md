# Play by the Sandbox

Event site for Play by the Sandbox, a creative event at the Vancouver Art Gallery in January 2027. It is one hand-written static page (`public/index.html`, with its CSS animations and scripts inline) plus a Vercel function, `api/og.js`, that renders the 1200x630 share card with `@vercel/og`.

The repo was imported on 2026-10-21 from Vercel production deployment `dpl_HRayQz8pD3L1Yn7Q7mJfhFaHU7Vq`. Before that the site was deployed with the Vercel CLI and had no git history.

## Layout

| Path                        | What it is                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `public/`                   | The site, served byte for byte. Don't reformat it: whitespace in `index.html` affects inline layout and the animations. |
| `api/og.js`                 | `GET /api/og`, the Open Graph image. Fetches Chewy and Gaegu from Google Fonts at request time.                         |
| `scripts/build.mjs`         | Production build: copies `public/` to `dist/`.                                                                          |
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
```

html-validate turns off three stylistic rules (`attr-quotes`, `doctype-style`, `no-inline-style`), because the page uses single-quoted attributes and inline styles throughout. Every structural rule still applies.

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
