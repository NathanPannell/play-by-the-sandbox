// The database: Postgres on Neon in production and staging (DATABASE_URL),
// PGlite in tests and local previews (setDb). Both answer query(text, params)
// with { rows }. Nothing here runs on a timer: a query happens only when a
// request needs one, and idle connections close after a few seconds, so the
// Neon compute can suspend (see C:\repo\AGENTS.md).
import pg from 'pg';

/** @typedef {{ query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }} Db */

/** @type {Db | null} */
let override = null;
/** @type {pg.Pool | null} */
let pool = null;

/** Use this database instead of DATABASE_URL (tests, local previews). @param {Db | null} db */
export function setDb(db) {
  override = db;
}

/** @returns {Db | null} null when no database is configured */
export function getDb() {
  if (override) return override;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 5000, connectionTimeoutMillis: 15000 });
    // A dropped idle connection (Neon suspending, say) must not crash the function.
    pool.on('error', (err) => console.error('Postgres pool error:', err.message));
  }
  return pool;
}

/**
 * Runs fn inside one transaction on one connection: a pg Pool checks out a
 * client, PGlite uses its own transaction(), anything else runs fn as is.
 * @template T
 * @param {Db} db
 * @param {(tx: Db) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function transaction(db, fn) {
  const any = /** @type {any} */ (db);
  if (typeof any.connect === 'function') {
    const client = await any.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  if (typeof any.transaction === 'function') return any.transaction(fn);
  return fn(db);
}

/** Closes the pool, if one was opened. */
export async function closeDb() {
  const p = pool;
  pool = null;
  await p?.end();
}
