// Applies the SQL files in migrations/ in name order, once each, recording
// them in schema_migrations. Everything runs in one transaction under an
// advisory lock, so two deploys can't migrate at the same time and a failed
// file leaves the database as it was.
//
// `npm run migrate` uses DATABASE_URL. Vercel runs it before every build
// (vercel.json), so staging and production migrate their own Neon branch on
// deploy. Without DATABASE_URL it does nothing, except on Vercel, where a
// missing database is an error. CI runs it against a throwaway Postgres.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const LOCK = 727_2027;

/**
 * One connection. pg's Client runs multi-statement SQL through query(); PGlite needs exec().
 * @typedef {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>, exec?: (sql: string) => Promise<unknown> }} Conn
 */

/**
 * @param {Conn} conn
 * @param {string} [dir]
 * @returns {Promise<string[]>} the files applied this time
 */
export async function migrate(conn, dir = migrationsDir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const run = (/** @type {string} */ sql) => (conn.exec ? conn.exec(sql) : conn.query(sql));
  await conn.query('begin');
  try {
    await conn.query('select pg_advisory_xact_lock($1)', [LOCK]);
    await conn.query(
      'create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())',
    );
    const { rows } = await conn.query('select version from schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      await run(readFileSync(`${dir}/${file}`, 'utf8'));
      await conn.query('insert into schema_migrations (version) values ($1)', [file]);
      applied.push(file);
    }
    await conn.query('commit');
    return applied;
  } catch (err) {
    await conn.query('rollback');
    throw err;
  }
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<string>} what happened, for the build log
 */
export async function main(env = process.env) {
  if (!env.DATABASE_URL) {
    if (env.VERCEL) throw new Error('DATABASE_URL is not set for this Vercel environment.');
    return 'No DATABASE_URL, so no migrations to run.';
  }
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const applied = await migrate(client);
    return applied.length ? `Applied ${applied.join(', ')}` : 'Database is up to date.';
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(await main());
  } catch (err) {
    console.error('Migration failed:', /** @type {Error} */ (err).message);
    process.exit(1);
  }
}
