// Serves the built site (dist/) and the api/ functions the way Vercel does,
// for the Playwright e2e run and local previews: `npm run build && npm run serve`.
// Without DATABASE_URL, the apply endpoints use an in-memory PGlite database
// that starts empty each run; the review password is REVIEW_SECRET (default
// "local-review").
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import * as apply from '../api/apply.js';
import { setDb } from '../api/_lib/db.js';
import { GET as og } from '../api/og.js';
import * as review from '../api/review.js';
import * as reviewPhoto from '../api/review-photo.js';
import { migrate } from './migrate.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.css': 'text/css; charset=utf-8',
};

/** @type {Record<string, Record<string, (request: Request) => Promise<Response>>>} */
const API = {
  '/api/og': { GET: og },
  '/api/apply': { POST: apply.POST },
  '/api/review': { GET: review.GET, PATCH: review.PATCH, DELETE: review.DELETE },
  '/api/review-photo': { GET: reviewPhoto.GET },
};

/** @param {string} pathname */
export function resolveFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const rel = normalize(decoded).replace(/^[\\/]+/, '');
  if (rel.startsWith('..')) return null;
  let file = join(root, rel === '' || rel === '.' ? 'index.html' : rel);
  // Like Vercel: /apply/creator serves apply/creator/index.html.
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/** An in-memory database with the migrations applied, for local runs. */
export async function useLocalDb() {
  const db = new PGlite();
  await migrate(db);
  setDb(db);
  return db;
}

/** @param {import('node:http').IncomingMessage} req @param {URL} url */
async function toRequest(req, url) {
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
  const method = req.method ?? 'GET';
  return new Request(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
}

export function startServer(port = 4321) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const api = API[url.pathname];
    if (api) {
      const handler = api[req.method ?? 'GET'];
      const response = handler
        ? await handler(await toRequest(req, url))
        : new Response('Method not allowed', { status: 405, headers: { allow: Object.keys(api).join(', ') } });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const file = resolveFile(url.pathname);
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[/** @type {keyof typeof TYPES} */ (extname(file))] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4321);
  if (!process.env.DATABASE_URL) await useLocalDb();
  process.env.REVIEW_SECRET ??= 'local-review';
  await startServer(port);
  console.log(`Serving dist/ on http://127.0.0.1:${port}`);
}
