import { expect, test } from "@playwright/test";
import sharp from "sharp";

async function png(color = "#146c63") {
  return sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).png().toBuffer();
}

test("creates an image and exposes it in Outputs", async ({ page }) => {
  const prompt = "A bright red observatory above a quiet forest";
  await page.goto("/create-image");
  await page.getByLabel("Prompt", { exact: true }).fill(prompt);
  await expect(page.getByLabel("Steps")).toHaveValue("20");
  await expect(page.getByLabel("Negative prompt")).toHaveValue(/deformed anatomy/);
  await page.getByRole("button", { name: "Add LoRA" }).click();
  await page.getByRole("button", { name: "Add LoRA" }).click();
  const imageLoras = page.locator('select[name="loraName"]');
  await expect(imageLoras).toHaveCount(2);
  await imageLoras.nth(0).selectOption("editorial-style.safetensors");
  await imageLoras.nth(1).selectOption("product-photo.sft");
  await page.locator('input[name="loraStrength"]').nth(0).fill("0.65");
  await page.locator('input[name="loraStrength"]').nth(1).fill("1.1");
  await page.screenshot({ path: "test-results/desktop-create-image.png", fullPage: true });
  await page.getByRole("button", { name: "Generate image" }).click();
  await expect(page).toHaveURL(/\/jobs/);
  await expect(page.locator("article").filter({ hasText: prompt }).getByText("completed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear finished" }).click();
  await expect(page.locator("article").filter({ hasText: prompt })).toHaveCount(0);
  await page.goto("/outputs");
  await expect(page.getByText("A bright red observatory above a quiet forest")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download original" }).first()).toHaveAttribute("href", /download=1/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove from outputs" }).first().click();
  await expect(page.getByText("A bright red observatory above a quiet forest")).toHaveCount(0);
});

test("uploads and edits an image", async ({ page }) => {
  const prompt = "Replace the background with a coral sunrise";
  await page.goto("/edit-image");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "source.png", mimeType: "image/png", buffer: await png() });
  await page.getByLabel("Edit prompt").fill(prompt);
  await expect(page.getByLabel("Negative prompt")).toHaveValue(/deformed anatomy/);
  await page.getByRole("button", { name: "Add LoRA" }).click();
  await page.locator('input[name="loraStrength"]').fill("0.9");
  await page.getByRole("button", { name: "Edit image" }).click();
  await expect(page).toHaveURL(/\/jobs/);
  await expect(page.locator("article").filter({ hasText: prompt }).getByText("completed", { exact: true })).toBeVisible();
});

test("generates and serves an LTX-2 video", async ({ page }) => {
  const prompt = "A slow cinematic push toward the horizon";
  await page.goto("/create-video");
  await expect(page.locator('select[name="duration"] option')).toHaveCount(20);
  await expect(page.getByLabel("Steps")).toHaveValue("20");
  await expect(page.getByLabel("Negative prompt")).toHaveValue(/deformed anatomy/);
  await page.locator('select[name="duration"]').selectOption("20");
  await page.getByRole("group", { name: "Start image *" }).locator('input[type="file"]').setInputFiles({ name: "start.png", mimeType: "image/png", buffer: await png("#dda928") });
  await page.getByLabel("Video prompt").fill(prompt);
  await page.getByRole("button", { name: "Add LoRA" }).click();
  await page.locator('select[name="loraName"]').selectOption("cinematic-motion.safetensors");
  await page.locator('input[name="loraStrength"]').fill("0.8");
  await page.getByRole("button", { name: "Generate video" }).click();
  await expect(page.locator("article").filter({ hasText: prompt }).getByText("completed", { exact: true })).toBeVisible();
  await page.goto("/outputs");
  const video = page.locator("video").first();
  await expect(video).toBeVisible();
  const source = await video.getAttribute("src");
  const response = await page.request.get(source!, { headers: { Range: "bytes=0-99" } });
  expect(response.status()).toBe(206);
  expect(response.headers()["content-range"]).toMatch(/^bytes 0-99\//);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear outputs" }).click();
  await expect(page.locator("video")).toHaveCount(0);
});

test("cancels an active generation", async ({ page }) => {
  const prompt = "A generation to cancel";
  await page.goto("/create-image");
  await page.getByLabel("Prompt", { exact: true }).fill(prompt);
  await page.getByRole("button", { name: "Generate image" }).click();
  const job = page.locator("article").filter({ hasText: prompt });
  await job.getByRole("button", { name: "Cancel job" }).click();
  await expect(job.getByText("cancelled", { exact: true })).toBeVisible();
});

test("does not accept arbitrary filesystem paths as asset handles", async ({ request }) => {
  const response = await request.get("/api/assets/C:%5CWindows%5Cwin.ini/content");
  expect(response.status()).toBe(404);
});