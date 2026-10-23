import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate.mjs';
import { apiSuite } from './apply-api.suite.mjs';

apiSuite('PGlite', async () => {
  const db = new PGlite();
  await migrate(db);
  return { db, close: () => db.close() };
});
