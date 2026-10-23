// POST /api/apply: a creator or brand application from /apply/creator or
// /apply/brand. multipart/form-data with `kind` (creator | brand), `data` (the
// answers as JSON), an optional `photo` file and the `nickname` honeypot.
// The answers are checked against the form's config (src/apply/forms.js).
import { getDb, transaction } from './_lib/db.js';
import { ipHash, json } from './_lib/http.js';
import { formFor, PHOTO } from '../src/apply/forms.js';
import { validate } from '../src/apply/validate.js';

const MAX_DATA = 64 * 1024;
const MAX_BODY = PHOTO.maxUpload + MAX_DATA + 64 * 1024;
const THANKS = 'Got it! Your application is in.';

/** The image type from the file's first bytes, or null. @param {Buffer} b */
export function sniffImage(b) {
  const head = b.subarray(0, 12).toString('latin1');
  if (head.startsWith('\xFF\xD8\xFF')) return 'image/jpeg';
  if (head.startsWith('\x89PNG\r\n\x1A\n')) return 'image/png';
  if (head.startsWith('GIF87a') || head.startsWith('GIF89a')) return 'image/gif';
  if (head.startsWith('RIFF') && head.slice(8) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * A limit from the environment, or its default. APPLY_RATE_LIMIT: applications
 * per address per hour. APPLY_DAILY_CAP: applications from everyone per day.
 * @param {string} name @param {number} fallback
 */
const limit = (name, fallback) => Number(process.env[name]) || fallback;

/** @param {Request} request */
export async function POST(request) {
  const db = getDb();
  // The review secret also keys the address hashes, so both must be set.
  const secret = process.env.REVIEW_SECRET;
  if (!db || !secret) return json(503, { ok: false, message: 'Applications aren’t open on this deployment yet.' });
  if (Number(request.headers.get('content-length')) > MAX_BODY) {
    return json(413, { ok: false, message: 'That’s too much to send at once. Try a smaller photo.' });
  }

  let body;
  try {
    body = await request.formData();
  } catch {
    return json(400, { ok: false, message: 'We couldn’t read that. Please try again.' });
  }
  const form = formFor(body.get('kind'));
  if (!form) return json(400, { ok: false, message: 'Unknown form.' });
  // Bots fill in every field; people never see this one. Pretend it worked.
  if (String(body.get('nickname') ?? '').trim()) return json(200, { ok: true, message: THANKS });

  const raw = body.get('data');
  let data;
  try {
    data = JSON.parse(typeof raw === 'string' && raw.length <= MAX_DATA ? raw : '');
  } catch {
    return json(400, { ok: false, message: 'We couldn’t read that. Please try again.' });
  }
  const { values, errors } = validate(form, data);

  const photoField = form.fields.find((f) => f.type === 'photo');
  const file = body.get('photo');
  /** @type {{ type: string, bytes: Buffer } | null} */
  let photo = null;
  if (photoField && file instanceof File && file.size > 0) {
    const bytes = file.size <= PHOTO.maxUpload ? Buffer.from(await file.arrayBuffer()) : null;
    const type = bytes && sniffImage(bytes);
    if (!bytes) errors[photoField.name] = 'That photo is too big. Please use one under 4 MB.';
    else if (!type) errors[photoField.name] = 'Please use a JPG, PNG, WebP or GIF image.';
    else photo = { type, bytes };
  }
  if (Object.keys(errors).length) {
    return json(400, { ok: false, errors, message: 'A few things need fixing. They’re marked in red.' });
  }

  try {
    const hash = ipHash(request, secret);
    // One transaction, locked per address, so parallel requests can't all slip
    // under the limit, and the application and its photo are saved together.
    const result = await transaction(db, async (tx) => {
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [hash]);
      const { rows: counts } = await tx.query(
        `select count(*) filter (where ip_hash = $1 and created_at > now() - interval '1 hour')::int as mine,
                count(*)::int as today
           from applications where created_at > now() - interval '1 day'`,
        [hash],
      );
      if (counts[0].mine >= limit('APPLY_RATE_LIMIT', 8)) return 'mine';
      if (counts[0].today >= limit('APPLY_DAILY_CAP', 1000)) return 'today';
      return insert(tx, form, values, hash, photo);
    });
    if (result === 'mine') {
      return json(429, {
        ok: false,
        message: 'That’s a lot of applications from one place. Please try again in an hour.',
      });
    }
    if (result === 'today') {
      return json(429, {
        ok: false,
        message: 'We’ve had a flood of applications today. Please try again tomorrow.',
      });
    }
    return json(200, { ok: true, id: result, message: THANKS });
  } catch (err) {
    console.error('apply: could not save', /** @type {Error} */ (err).message);
    return json(500, { ok: false, message: 'Something went wrong on our side. Please try again in a minute.' });
  }
}

/**
 * Saves the application and its photo in one statement; returns the new id.
 * @param {import('./_lib/db.js').Db} tx
 * @param {import('../src/apply/forms.js').Form} form
 * @param {Record<string, unknown>} values
 * @param {string} hash
 * @param {{ type: string, bytes: Buffer } | null} photo
 */
async function insert(tx, form, values, hash, photo) {
  const { rows } = await tx.query(
    `with app as (
         insert into applications (kind, name, email, answers, ip_hash)
         values ($1, $2, $3, $4::jsonb, $5)
         returning id
       ), pic as (
         insert into application_photos (application_id, content_type, size, bytes)
         select id, $6, $7, $8 from app where $8::bytea is not null
       )
       select id from app`,
    [
      form.kind,
      values[form.nameField],
      values[form.emailField],
      JSON.stringify(values),
      hash,
      photo?.type ?? null,
      photo?.bytes.length ?? null,
      photo?.bytes ?? null,
    ],
  );
  return /** @type {string} */ (rows[0].id);
}
