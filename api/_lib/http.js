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
 * The rate-limit bucket for an address: IPv4 as is, IPv6 by its /64 (one home
 * connection usually gets a whole /64), IPv4-mapped IPv6 as the IPv4 address.
 * @param {string} ip
 */
export function addressBucket(ip) {
  if (!ip.includes(':')) return ip;
  if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1);
  const [head, tail] = ip.split('::');
  const front = head ? head.split(':') : [];
  const back = tail ? tail.split(':') : [];
  const groups = [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back];
  return `${groups
    .slice(0, 4)
    .map((g) => (parseInt(g, 16) || 0).toString(16))
    .join(':')}::/64`;
}

/**
 * The first client address Vercel saw, bucketed and hashed with the review
 * secret, so the database never holds raw IP addresses. Only for rate limiting.
 * @param {Request} request
 * @param {string} secret
 */
export function ipHash(request, secret) {
  const ip =
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  return createHmac('sha256', secret).update(addressBucket(ip)).digest('hex').slice(0, 32);
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
