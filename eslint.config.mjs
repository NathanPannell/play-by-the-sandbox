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
  // Playwright evaluate() callbacks, the hero bundle and the page scripts run in the browser.
  { files: ['e2e/**', 'tools/**', 'src/**', 'public/**'], languageOptions: { globals: { ...globals.browser } } },
  // The page scripts in public/js are classic scripts, not modules.
  { files: ['public/**/*.js'], languageOptions: { sourceType: 'script' } },
];
