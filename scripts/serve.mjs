// Serves the built site (dist/) and the api/og function the way Vercel does,
// for the Playwright e2e run and local previews: `npm run build && npm run serve`.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GET as og } from '../api/og.js';

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
  const file = join(root, rel === '' || rel === '.' ? 'index.html' : rel);
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

export function startServer(port = 4321) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname === '/api/og') {
      const response = await og(new Request(url));
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
  await startServer(port);
  console.log(`Serving dist/ on http://127.0.0.1:${port}`);
}
