import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --port 3100", url: "http://127.0.0.1:3100/api/health", reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "desktop-chromium", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", testMatch: /mobile\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});