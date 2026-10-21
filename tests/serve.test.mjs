import { request as httpGet } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '../scripts/build.mjs';
import { resolveFile, startServer } from '../scripts/serve.mjs';

/** @type {import('node:http').Server} */
let server;
let port = 0;

/** @param {string} path @returns {Promise<{ status: number, type: string, body: Buffer }>} */
const get = (path) =>
  new Promise((resolve, reject) => {
    httpGet({ host: '127.0.0.1', port, path }, (res) => {
      /** @type {Buffer[]} */
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          type: String(res.headers['content-type']),
          body: Buffer.concat(chunks),
        }),
      );
    })
      .on('error', reject)
      .end();
  });

beforeAll(async () => {
  build();
  server = /** @type {import('node:http').Server} */ (await startServer(0));
  port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('local server', () => {
  it('serves index.html at /', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html; charset=utf-8');
    expect(res.body.toString()).toContain('<title>Play by the Sandbox');
  });

  it.each([
    ['/logo.svg', 'image/svg+xml'],
    ['/icon-192.png', 'image/png'],
    ['/robots.txt', 'text/plain; charset=utf-8'],
    ['/sitemap.xml', 'application/xml'],
    ['/site.webmanifest', 'application/manifest+json'],
  ])('serves %s as %s', async (path, type) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.type).toBe(type);
  });

  it('returns 404 for missing files', async () => {
    expect((await get('/nope.html')).status).toBe(404);
  });

  it('never resolves paths outside dist/', () => {
    expect(resolveFile('/../package.json')).toBeNull();
    expect(resolveFile('/%2e%2e/package.json')).toBeNull();
    expect(resolveFile('/%E0')).toBeNull();
  });
});
