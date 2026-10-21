import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'coverage/', 'test-results/', 'playwright-report/', 'node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  // Playwright evaluate() callbacks run in the browser.
  { files: ['e2e/**'], languageOptions: { globals: { ...globals.browser } } },
];
