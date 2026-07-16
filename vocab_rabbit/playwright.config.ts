import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5176',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5176',
    url: 'http://127.0.0.1:5176/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
