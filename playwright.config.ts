import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: { command: `npm run dev -- --port ${port}`, url: `http://127.0.0.1:${port}/api/health`, reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "desktop-chromium", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", testMatch: /mobile\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});