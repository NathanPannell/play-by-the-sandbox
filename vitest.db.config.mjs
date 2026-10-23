import { defineConfig } from 'vitest/config';

// `npm run test:db`: the database tests, against TEST_DATABASE_URL (CI's
// throwaway Postgres service). Coverage comes from the unit run (vitest.config.mjs).
export default defineConfig({
  test: {
    include: ['tests-db/**/*.test.mjs'],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
