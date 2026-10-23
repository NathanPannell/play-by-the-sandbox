// The team's review endpoint for /apply/review. Every request needs
// `Authorization: Bearer <REVIEW_SECRET>`.
//   GET                      applications, newest first (no photo bytes)
//   PATCH {id, status}       set the status: new, shortlisted or declined
//   DELETE ?id=<uuid>        delete an application and its photo
import { json, teamOnly, UUID } from './_lib/http.js';
import { STATUSES } from '../src/apply/forms.js';

/** @param {Request} request */
export async function GET(request) {
  const { db, error } = teamOnly(request);
  if (error) return error;
  const { rows } = await db.query(
    `select a.id, a.kind, a.name, a.email, a.answers, a.status, a.created_at, a.updated_at,
            (p.application_id is not null) as has_photo
       from applications a left join application_photos p on p.application_id = a.id
      order by a.created_at desc
      limit 1000`,
  );
  return json(200, { applications: rows });
}

/** @param {Request} request */
export async function PATCH(request) {
  const { db, error } = teamOnly(request);
  if (error) return error;
  const body = await request.json().catch(() => null);
  if (!body || !UUID.test(String(body.id)) || !STATUSES.includes(body.status)) {
    return json(400, { message: `Send an application id and a status (${STATUSES.join(', ')}).` });
  }
  const { rows } = await db.query(
    'update applications set status = $2, updated_at = now() where id = $1 returning id, status',
    [body.id, body.status],
  );
  return rows.length ? json(200, rows[0]) : json(404, { message: 'No such application.' });
}

/** @param {Request} request */
export async function DELETE(request) {
  const { db, error } = teamOnly(request);
  if (error) return error;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!UUID.test(id)) return json(400, { message: 'Send an application id.' });
  const { rows } = await db.query('delete from applications where id = $1 returning id', [id]);
  return rows.length ? json(200, { deleted: id }) : json(404, { message: 'No such application.' });
}
