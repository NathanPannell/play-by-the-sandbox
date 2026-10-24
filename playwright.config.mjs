import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets two checkouts run the suite side by side.
const PORT = Number(process.env.E2E_PORT ?? 4321);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Serves the production build (dist/) plus the api/ functions.
  webServer: {
    command: 'npm run build && npm run serve',
    url: `http://127.0.0.1:${PORT}/`,
    // No DATABASE_URL, so the apply endpoints use an in-memory database.
    env: { PORT: String(PORT), REVIEW_SECRET: 'e2e-review-secret', APPLY_RATE_LIMIT: '1000' },
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
