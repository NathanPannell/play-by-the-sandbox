import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main, migrate } from '../scripts/migrate.mjs';

// main() connects with pg; this stand-in records the SQL instead.
const fake = vi.hoisted(() => ({ queries: /** @type {string[]} */ ([]), fail: '', fresh: false, ended: false }));
vi.mock('pg', () => {
  class Client {
    async connect() {}
    /** @param {string} sql */
    async query(sql) {
      fake.queries.push(sql);
      if (fake.fail && sql.startsWith(fake.fail)) throw new Error('boom');
      return { rows: sql.startsWith('select version') && !fake.fresh ? [{ version: '0001_applications.sql' }] : [] };
    }
    async end() {
      fake.ended = true;
    }
  }
  return { default: { Client } };
});

describe('migrate', () => {
  /** @type {string | null} */
  let dir = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('applies each migration once, in order', async () => {
    const db = new PGlite();
    expect(await migrate(db)).toEqual(['0001_applications.sql']);
    expect(await migrate(db)).toEqual([]);
    const { rows } = await db.query('select version from schema_migrations');
    expect(rows).toEqual([{ version: '0001_applications.sql' }]);
    await db.close();
  });

  it('rolls everything back when a migration fails', async () => {
    dir = mkdtempSync(join(tmpdir(), 'pbts-migrate-'));
    writeFileSync(join(dir, '0001_ok.sql'), 'create table ok (id int);');
    writeFileSync(join(dir, '0002_bad.sql'), 'create table bad (id nope);');
    writeFileSync(join(dir, 'README.md'), 'not a migration');
    const db = new PGlite();
    await expect(migrate(db, dir)).rejects.toThrow(/nope/);
    const { rows } = await db.query(
      `select to_regclass('ok')::text as ok, to_regclass('schema_migrations')::text as m`,
    );
    expect(rows).toEqual([{ ok: null, m: null }]);
    await db.close();
  });
});

describe('npm run migrate', () => {
  afterEach(() => {
    fake.queries.length = 0;
    fake.fail = '';
    fake.fresh = false;
    fake.ended = false;
  });

  it('does nothing without DATABASE_URL, except on Vercel', async () => {
    expect(await main({})).toBe('No DATABASE_URL, so no migrations to run.');
    await expect(main({ VERCEL: '1' })).rejects.toThrow('DATABASE_URL is not set for this Vercel environment.');
  });

  it('migrates DATABASE_URL in one transaction and closes the connection', async () => {
    expect(await main({ DATABASE_URL: 'postgres://example' })).toBe('Database is up to date.');
    expect(fake.queries[0]).toBe('begin');
    expect(fake.queries.at(-1)).toBe('commit');
    expect(fake.ended).toBe(true);
  });

  it('lists what it applied', async () => {
    fake.fresh = true;
    expect(await main({ DATABASE_URL: 'postgres://example' })).toBe('Applied 0001_applications.sql');
    expect(fake.queries.some((q) => q.includes('create table applications'))).toBe(true);
  });

  it('rolls back and closes the connection when it fails', async () => {
    fake.fresh = true;
    fake.fail = 'insert into schema_migrations';
    await expect(main({ DATABASE_URL: 'postgres://example' })).rejects.toThrow('boom');
    expect(fake.queries.at(-1)).toBe('rollback');
    expect(fake.ended).toBe(true);
  });
});
