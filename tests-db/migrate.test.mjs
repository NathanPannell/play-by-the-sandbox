// Migrations on a real Postgres: `npm run migrate` has already applied them,
// so running them again changes nothing, and the schema is what the API uses.
import pg from 'pg';
import { expect, it } from 'vitest';
import { main } from '../scripts/migrate.mjs';

const url = process.env.TEST_DATABASE_URL;

it('is idempotent', async () => {
  expect(await main({ DATABASE_URL: url })).toBe('Database is up to date.');
});

it('records every migration and builds the tables', async () => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const versions = (await client.query('select version from schema_migrations order by version')).rows.map(
      (r) => r.version,
    );
    expect(versions).toEqual(['0001_applications.sql']);
    const cols = await client.query(
      `select table_name, column_name from information_schema.columns
        where table_name in ('applications', 'application_photos') order by table_name, ordinal_position`,
    );
    expect(cols.rows.map((r) => `${r.table_name}.${r.column_name}`)).toEqual([
      'application_photos.application_id',
      'application_photos.content_type',
      'application_photos.size',
      'application_photos.bytes',
      'applications.id',
      'applications.kind',
      'applications.name',
      'applications.email',
      'applications.answers',
      'applications.status',
      'applications.ip_hash',
      'applications.created_at',
      'applications.updated_at',
    ]);
  } finally {
    await client.end();
  }
});
