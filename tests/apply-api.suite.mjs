// The apply and review endpoints, end to end against a database. The same
// suite runs on PGlite in the unit tests (tests/apply-api.test.mjs) and on a
// real Postgres in CI's Database job (tests-db/apply-api.test.mjs).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '../api/apply.js';
import { setDb } from '../api/_lib/db.js';
import { GET as photoGet } from '../api/review-photo.js';
import { DELETE, GET, PATCH } from '../api/review.js';
import { GOOD, PNG } from './apply-fixtures.mjs';

const SECRET = 'test-review-secret';
const AUTH = { authorization: `Bearer ${SECRET}` };

/**
 * @param {string} kind
 * @param {unknown} data
 * @param {{ photo?: Blob, nickname?: string, ip?: string }} [opts]
 */
export function applyRequest(kind, data, opts = {}) {
  const body = new FormData();
  body.set('kind', kind);
  body.set('data', typeof data === 'string' ? data : JSON.stringify(data));
  if (opts.nickname) body.set('nickname', opts.nickname);
  if (opts.photo) body.set('photo', opts.photo, 'photo');
  return new Request('http://test/api/apply', {
    method: 'POST',
    body,
    headers: { 'x-forwarded-for': `${opts.ip ?? '203.0.113.7'}, 10.0.0.1` },
  });
}

/** @param {string} [query] @param {RequestInit} [init] */
const reviewRequest = (query = '', init = {}) =>
  new Request(`http://test/api/review${query}`, { ...init, headers: { ...AUTH, ...init.headers } });

/** @param {Response} res */
const body = async (res) => ({ status: res.status, json: await res.json() });

const list = async () => (await (await GET(reviewRequest())).json()).applications;

/**
 * @param {string} name
 * @param {() => Promise<{ db: import('../api/_lib/db.js').Db, close: () => Promise<void> }>} open
 */
export function apiSuite(name, open) {
  describe(`apply and review endpoints (${name})`, () => {
    /** @type {import('../api/_lib/db.js').Db} */
    let db;
    /** @type {() => Promise<void>} */
    let close;

    beforeAll(async () => {
      ({ db, close } = await open());
      setDb(db);
      process.env.REVIEW_SECRET = SECRET;
    });
    afterAll(async () => {
      setDb(null);
      delete process.env.REVIEW_SECRET;
      await close();
    });
    beforeEach(async () => {
      delete process.env.APPLY_RATE_LIMIT;
      setDb(db);
      process.env.REVIEW_SECRET = SECRET;
      await db.query('delete from applications');
    });

    it('saves a creator application with a photo, and the team can see it', async () => {
      const res = await body(await POST(applyRequest('creator', GOOD.creator, { photo: new Blob([PNG]) })));
      expect(res).toEqual({
        status: 200,
        json: { ok: true, id: expect.any(String), message: 'Got it! Your application is in.' },
      });

      const [app] = await list();
      expect(app).toMatchObject({
        id: res.json.id,
        kind: 'creator',
        name: 'Robin Test',
        email: 'robin@example.com',
        status: 'new',
        has_photo: true,
      });
      expect(app.answers.socials).toEqual([{ platform: 'Instagram', url: 'https://www.instagram.com/robin.makes/' }]);
      expect(app.answers.unknownField).toBeUndefined();

      const photo = await photoGet(new Request(`http://test/api/review-photo?id=${app.id}`, { headers: AUTH }));
      expect(photo.status).toBe(200);
      expect(photo.headers.get('content-type')).toBe('image/png');
      expect(photo.headers.get('cache-control')).toBe('private, no-store');
      expect(Buffer.from(await photo.arrayBuffer()).equals(PNG)).toBe(true);
    });

    it('saves a brand application without a photo, and lists newest first', async () => {
      await POST(applyRequest('creator', GOOD.creator));
      await POST(applyRequest('brand', GOOD.brand, { photo: new Blob([]) }));
      const apps = await list();
      expect(apps.map((/** @type {any} */ a) => [a.kind, a.name, a.has_photo])).toEqual([
        ['brand', 'Crayon Co.', false],
        ['creator', 'Robin Test', false],
      ]);
    });

    it('accepts JPEG, GIF and WebP photos by their bytes', async () => {
      const kinds = {
        'image/jpeg': [0xff, 0xd8, 0xff, 0xe0],
        'image/gif': [...Buffer.from('GIF89a')],
        'image/webp': [...Buffer.from('RIFF\0\0\0\0WEBPVP8 ')],
      };
      for (const [type, bytes] of Object.entries(kinds)) {
        const { json } = await body(
          await POST(applyRequest('brand', GOOD.brand, { photo: new Blob([new Uint8Array(bytes)]) })),
        );
        const photo = await photoGet(new Request(`http://test/api/review-photo?id=${json.id}`, { headers: AUTH }));
        expect(photo.headers.get('content-type')).toBe(type);
      }
    });

    it('sends field errors back and saves nothing', async () => {
      const res = await body(await POST(applyRequest('creator', { ...GOOD.creator, email: 'nope', consent: false })));
      expect(res).toEqual({
        status: 400,
        json: {
          ok: false,
          errors: {
            email: 'That email doesn’t look right.',
            consent: 'Please tick this box to send your application.',
          },
          message: 'A few things need fixing. They’re marked in red.',
        },
      });
      expect(await list()).toEqual([]);
    });

    it('rejects photos that are too big or not images', async () => {
      const big = await body(
        await POST(applyRequest('creator', GOOD.creator, { photo: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]) })),
      );
      expect(big.status).toBe(400);
      expect(big.json.errors).toEqual({ photo: 'That photo is too big. Please use one under 4 MB.' });
      const text = await body(await POST(applyRequest('creator', GOOD.creator, { photo: new Blob(['<svg></svg>']) })));
      expect(text.json.errors).toEqual({ photo: 'Please use a JPG, PNG, WebP or GIF image.' });
      expect(await list()).toEqual([]);
    });

    it('pretends to accept honeypot submissions, and drops them', async () => {
      const res = await body(await POST(applyRequest('creator', GOOD.creator, { nickname: 'bot' })));
      expect(res).toEqual({ status: 200, json: { ok: true, message: 'Got it! Your application is in.' } });
      expect(await list()).toEqual([]);
    });

    it('rejects unknown forms and unreadable bodies', async () => {
      expect((await POST(applyRequest('admin', GOOD.creator))).status).toBe(400);
      expect((await POST(applyRequest('creator', '{not json'))).status).toBe(400);
      expect((await POST(applyRequest('creator', 'x'.repeat(70 * 1024)))).status).toBe(400);
      const notMultipart = new Request('http://test/api/apply', {
        method: 'POST',
        body: 'hello',
        headers: { 'content-type': 'text/plain' },
      });
      expect(await body(await POST(notMultipart))).toEqual({
        status: 400,
        json: { ok: false, message: 'We couldn’t read that. Please try again.' },
      });
      const huge = new Request('http://test/api/apply', {
        method: 'POST',
        body: 'x',
        headers: { 'content-length': String(5 * 1024 * 1024) },
      });
      expect((await POST(huge)).status).toBe(413);
    });

    it('limits applications per address per hour', async () => {
      process.env.APPLY_RATE_LIMIT = '2';
      expect((await POST(applyRequest('creator', GOOD.creator))).status).toBe(200);
      expect((await POST(applyRequest('brand', GOOD.brand))).status).toBe(200);
      const third = await body(await POST(applyRequest('brand', GOOD.brand)));
      expect(third.status).toBe(429);
      expect(third.json.message).toMatch(/try again in an hour/);
      expect((await POST(applyRequest('brand', GOOD.brand, { ip: '198.51.100.2' }))).status).toBe(200);

      // Without x-forwarded-for, x-real-ip is the address; with neither, everyone shares one bucket.
      const bare = (/** @type {Record<string, string>} */ headers) => {
        const req = applyRequest('brand', GOOD.brand);
        req.headers.delete('x-forwarded-for');
        for (const [k, v] of Object.entries(headers)) req.headers.set(k, v);
        return POST(req);
      };
      expect((await bare({ 'x-real-ip': '192.0.2.1' })).status).toBe(200);
      expect((await bare({})).status).toBe(200);
      expect((await bare({})).status).toBe(200);
      expect((await bare({})).status).toBe(429);
      const rows = await db.query('select ip_hash from applications');
      expect(rows.rows.every((r) => /^[0-9a-f]{32}$/.test(r.ip_hash))).toBe(true);
    });

    it('says so when there is no database, or it fails', async () => {
      setDb(null);
      const url = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
        expect((await POST(applyRequest('creator', GOOD.creator))).status).toBe(503);
        expect((await GET(reviewRequest())).status).toBe(503);
      } finally {
        if (url) process.env.DATABASE_URL = url;
      }
      setDb({ query: () => Promise.reject(new Error('down')) });
      const res = await body(await POST(applyRequest('creator', GOOD.creator)));
      expect(res).toEqual({
        status: 500,
        json: { ok: false, message: 'Something went wrong on our side. Please try again in a minute.' },
      });
    });

    it('keeps the team endpoints behind the review secret', async () => {
      const bare = (/** @type {Record<string, string>} */ headers) =>
        new Request('http://test/api/review', { headers });
      expect((await GET(bare({}))).status).toBe(401);
      expect(await body(await GET(bare({ authorization: 'Bearer wrong' })))).toEqual({
        status: 401,
        json: { message: 'Wrong password.' },
      });
      expect((await GET(bare({ authorization: `bearer ${SECRET}` }))).status).toBe(200);
      for (const handler of [PATCH, DELETE, photoGet]) expect((await handler(bare({}))).status).toBe(401);
      delete process.env.REVIEW_SECRET;
      expect((await GET(reviewRequest())).status).toBe(503);
    });

    it('sets an application’s status', async () => {
      const { json } = await body(await POST(applyRequest('creator', GOOD.creator)));
      const patch = (/** @type {unknown} */ data) =>
        PATCH(reviewRequest('', { method: 'PATCH', body: typeof data === 'string' ? data : JSON.stringify(data) }));
      expect(await body(await patch({ id: json.id, status: 'shortlisted' }))).toEqual({
        status: 200,
        json: { id: json.id, status: 'shortlisted' },
      });
      expect((await list())[0].status).toBe('shortlisted');
      expect((await patch({ id: json.id, status: 'maybe' })).status).toBe(400);
      expect((await patch({ id: 'nope', status: 'new' })).status).toBe(400);
      expect((await patch('{')).status).toBe(400);
      expect((await patch({ id: '00000000-0000-4000-8000-000000000000', status: 'new' })).status).toBe(404);
    });

    it('deletes an application and its photo', async () => {
      const { json } = await body(await POST(applyRequest('creator', GOOD.creator, { photo: new Blob([PNG]) })));
      const del = (/** @type {string} */ id) => DELETE(reviewRequest(`?id=${id}`, { method: 'DELETE' }));
      expect(await body(await del(json.id))).toEqual({ status: 200, json: { deleted: json.id } });
      expect(await list()).toEqual([]);
      expect((await db.query('select count(*)::int as n from application_photos')).rows[0].n).toBe(0);
      expect((await del(json.id)).status).toBe(404);
      expect((await del('nope')).status).toBe(400);
      expect((await DELETE(reviewRequest('', { method: 'DELETE' }))).status).toBe(400);
    });

    it('serves photos only for real ids', async () => {
      const { json } = await body(await POST(applyRequest('brand', GOOD.brand)));
      const photo = (/** @type {string} */ q) =>
        photoGet(new Request(`http://test/api/review-photo${q}`, { headers: AUTH }));
      expect((await photo(`?id=${json.id}`)).status).toBe(404);
      expect((await photo('?id=x')).status).toBe(400);
      expect((await photo('')).status).toBe(400);
    });
  });
}
