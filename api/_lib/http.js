// Small helpers shared by the api/ functions.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from './db.js';

/** @param {number} status @param {unknown} body */
export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** @param {string} s */
const sha256 = (s) => createHash('sha256').update(s).digest();

/**
 * The first client address Vercel saw, hashed with a server secret so the
 * database never holds raw IP addresses. Used only for rate limiting.
 * @param {Request} request
 */
export function ipHash(request) {
  const ip =
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return createHmac('sha256', process.env.REVIEW_SECRET ?? 'play-by-the-sandbox')
    .update(ip)
    .digest('hex')
    .slice(0, 32);
}

/**
 * For the team's endpoints: the database, or the error response to send.
 * The caller must send `Authorization: Bearer <REVIEW_SECRET>`.
 * @param {Request} request
 * @returns {{ db: import('./db.js').Db, error?: undefined } | { error: Response, db?: undefined }}
 */
export function teamOnly(request) {
  const secret = process.env.REVIEW_SECRET;
  const db = getDb();
  if (!secret || !db) return { error: json(503, { message: 'The review page isn’t set up on this deployment.' }) };
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!given || !timingSafeEqual(sha256(given), sha256(secret)))
    return { error: json(401, { message: 'Wrong password.' }) };
  return { db };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
