import { expect, test } from "@playwright/test";
import sharp from "sharp";

async function png(color: string) {
  return sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).png().toBuffer();
}

test("keeps the creation workflow and bottom navigation usable on phone viewports", async ({ page }) => {
  const settings = await (await page.request.get("/api/settings")).json();
  const savedCharacterPrompt = String(settings.preferences.characterPrompt);
  await page.goto("/create-image");
  await expect(page.getByRole("heading", { name: "Create an image" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  await page.getByRole("button", { name: "Insert character" }).click();
  await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(savedCharacterPrompt);
  await page.getByLabel("Acceleration preset").selectOption("fixture-qwen-lightning");
  await expect(page.getByLabel("Steps")).toHaveValue("4");
  await expect(page.getByLabel("Guidance (CFG)")).toHaveValue("1");
  const action = page.getByRole("button", { name: "Generate image" });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-create-image.png", fullPage: true });
});

test("keeps the face-swap edit workflow usable on phone viewports", async ({ page }) => {
  await page.goto("/edit-image");
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles({ name: "source.png", mimeType: "image/png", buffer: await png("#e3482d") });
  await page.getByRole("switch", { name: /Face swap/ }).check();
  await fileInputs.nth(1).setInputFiles({ name: "face.png", mimeType: "image/png", buffer: await png("#146c63") });
  const action = page.getByRole("button", { name: "Swap face" });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  await expect(action).toBeEnabled();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-face-swap.png", fullPage: true });
});