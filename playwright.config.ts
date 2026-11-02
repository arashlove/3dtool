import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  // Each test renders WebGL scenes; parallel workers starve each other and time out.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npm run start',
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/studio`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
