import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['api/**', 'scripts/**', 'src/**'],
      // The hero's DOM and WebGL entry point needs a real browser with a GPU;
      // the Playwright suite covers it (e2e/hero.spec.mjs).
      exclude: ['src/hero/main.js'],
      reporter: ['text', 'json-summary'],
      // Floor set at the level reached when CI was added. Raise it, never lower it.
      thresholds: { lines: 96, functions: 100, branches: 86, statements: 96 },
    },
  },
});
