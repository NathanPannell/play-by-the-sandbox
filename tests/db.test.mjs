import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb, setDb } from '../api/_lib/db.js';

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
