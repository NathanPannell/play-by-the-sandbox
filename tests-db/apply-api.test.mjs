// Runs in CI's Database job against a throwaway Postgres (TEST_DATABASE_URL),
// after `npm run migrate` has migrated it: `npm run test:db`.
import pg from 'pg';
import { apiSuite } from '../tests/apply-api.suite.mjs';

apiSuite('Postgres', async () => {
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  return { db, close: () => db.end() };
});
