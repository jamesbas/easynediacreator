import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";

/**
 * The suite asserts fixture models, fixture LoRAs and the Qwen image defaults,
 * so it pins them rather than inheriting `.env.local` — that file is per
 * machine, and changing the default image model there failed six tests that had
 * nothing wrong with them. Next skips any variable already set in the
 * environment, so these win. Saved settings go to a scratch folder for the same
 * reason, and prompt enhancement is off so no run can reach a real LM Studio
 * and evict whatever model the machine has loaded.
 */
const env = {
  WANGP_CLIENT_MODE: "fake",
  WANGP_LORA_ROOT: "",
  WANGP_PROFILES_ROOT: "",
  WANGP_LORA_METADATA_ROOT: "",
  DATA_ROOT: path.join(os.tmpdir(), "easy-media-e2e"),
  ENABLED_IMAGE_CREATE_MODELS: "qwen-image,flux-klein-9b,krea-2",
  ENABLED_IMAGE_EDIT_MODELS: "qwen-image-edit,flux-klein-9b,krea-2-edit",
  DEFAULT_IMAGE_CREATE_MODEL: "qwen-image",
  DEFAULT_IMAGE_EDIT_MODEL: "qwen-image-edit",
  DEFAULT_VIDEO_MODEL: "ltx2_fixture",
  LM_STUDIO_BASE_URL: "",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: { command: `npm run dev -- --port ${port}`, url: `http://127.0.0.1:${port}/api/health`, reuseExistingServer: true, timeout: 120_000, env },
  projects: [
    { name: "desktop-chromium", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", testMatch: /mobile\.spec\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
});