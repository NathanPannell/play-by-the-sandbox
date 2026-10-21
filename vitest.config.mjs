import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['api/**', 'scripts/**'],
      reporter: ['text', 'json-summary'],
      // Floor set at the level reached when CI was added. Raise it, never lower it.
      thresholds: { lines: 83, functions: 100, branches: 75, statements: 84 },
    },
  },
});
