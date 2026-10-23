// GET /api/review-photo?id=<uuid>: an application's photo, for /apply/review.
// Needs `Authorization: Bearer <REVIEW_SECRET>`, so photos are never public.
import { json, teamOnly, UUID } from './_lib/http.js';

/** @param {Request} request */
export async function GET(request) {
  const { db, error } = teamOnly(request);
  if (error) return error;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return json(400, { message: 'Send an application id.' });
  const { rows } = await db.query('select content_type, bytes from application_photos where application_id = $1', [id]);
  if (!rows.length) return json(404, { message: 'No photo.' });
  return new Response(Buffer.from(rows[0].bytes), {
    headers: {
      'content-type': rows[0].content_type,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}
