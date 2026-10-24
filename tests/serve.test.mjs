import { request as httpGet } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from '../scripts/build.mjs';
import { resolveFile, startServer, useLocalDb } from '../scripts/serve.mjs';
import { GOOD, PNG } from './apply-fixtures.mjs';

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
  await useLocalDb();
  process.env.REVIEW_SECRET = 'serve-test-secret';
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
    ['/hero.js', 'text/javascript; charset=utf-8'],
    ['/hero-poster.jpg', 'image/jpeg'],
    ['/styles/tokens.css', 'text/css; charset=utf-8'],
    ['/js/glove.js', 'text/javascript; charset=utf-8'],
    ['/apply/apply.css', 'text/css; charset=utf-8'],
    ['/apply/apply.js', 'text/javascript; charset=utf-8'],
    ['/apply/creator', 'text/html; charset=utf-8'],
    ['/apply/brand/', 'text/html; charset=utf-8'],
    ['/apply/review', 'text/html; charset=utf-8'],
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

describe('local api', () => {
  const url = (/** @type {string} */ path) => `http://127.0.0.1:${port}${path}`;
  const auth = { authorization: 'Bearer serve-test-secret' };

  it('takes an application into the local database and lists it for review', async () => {
    const body = new FormData();
    body.set('kind', 'creator');
    body.set('data', JSON.stringify(GOOD.creator));
    body.set('photo', new Blob([PNG]), 'me.png');
    const res = await fetch(url('/api/apply'), { method: 'POST', body });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const { id } = await res.json();

    expect((await fetch(url('/api/review'))).status).toBe(401);
    const list = await (await fetch(url('/api/review'), { headers: auth })).json();
    expect(list.applications.map((/** @type {any} */ a) => a.id)).toEqual([id]);
    const photo = await fetch(url(`/api/review-photo?id=${id}`), { headers: auth });
    expect(Buffer.from(await photo.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('answers 405 for methods an endpoint lacks', async () => {
    const res = await fetch(url('/api/review'), { method: 'PUT' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, PATCH, DELETE');
  });
});
