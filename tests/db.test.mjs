import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb, setDb, transaction } from '../api/_lib/db.js';

describe('database connection', () => {
  afterEach(async () => {
    delete process.env.DATABASE_URL;
    setDb(null);
    await closeDb();
    vi.restoreAllMocks();
  });

  it('is null until DATABASE_URL is set', () => {
    expect(getDb()).toBeNull();
  });

  it('opens one small pool for DATABASE_URL, lazily', () => {
    process.env.DATABASE_URL = 'postgres://user:pw@db.example.com/sandbox';
    const pool = /** @type {pg.Pool} */ (getDb());
    expect(pool).toBeInstanceOf(pg.Pool);
    expect(getDb()).toBe(pool);
    expect(pool.totalCount).toBe(0);
    expect(pool.options).toMatchObject({ max: 3, idleTimeoutMillis: 5000 });
  });

  it('logs dropped idle connections instead of crashing', () => {
    process.env.DATABASE_URL = 'postgres://user:pw@db.example.com/sandbox';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    /** @type {pg.Pool} */ (getDb()).emit('error', new Error('terminating connection'));
    expect(log).toHaveBeenCalledWith('Postgres pool error:', 'terminating connection');
  });

  it('prefers a database set with setDb', () => {
    process.env.DATABASE_URL = 'postgres://user:pw@db.example.com/sandbox';
    const db = { query: async () => ({ rows: [] }) };
    setDb(db);
    expect(getDb()).toBe(db);
  });

  it('closes cleanly with no pool open', async () => {
    await expect(closeDb()).resolves.toBeUndefined();
  });
});

describe('transaction', () => {
  /** A stand-in pg Pool that records what its one client was asked. */
  function fakePool(/** @type {string} */ failOn = '') {
    const log = /** @type {string[]} */ ([]);
    const client = {
      query: async (/** @type {string} */ sql) => {
        log.push(sql);
        if (failOn && sql === failOn) throw new Error(`no ${sql}`);
        return { rows: [] };
      },
      release: () => log.push('release'),
    };
    return { log, pool: { connect: async () => client, query: client.query } };
  }

  it('runs on one pooled client between begin and commit', async () => {
    const { log, pool } = fakePool();
    expect(await transaction(pool, async (tx) => (await tx.query('select 1'), 'done'))).toBe('done');
    expect(log).toEqual(['begin', 'select 1', 'commit', 'release']);
  });

  it('rolls back and releases the client when the work fails, even if rollback fails', async () => {
    const { log, pool } = fakePool('rollback');
    await expect(transaction(pool, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(log).toEqual(['begin', 'rollback', 'release']);
  });

  it('runs plain databases as they are', async () => {
    const db = { query: async () => ({ rows: [{ n: 1 }] }) };
    expect(await transaction(db, (tx) => tx.query('select 1'))).toEqual({ rows: [{ n: 1 }] });
  });
});
