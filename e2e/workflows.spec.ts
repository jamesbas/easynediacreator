import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { FACE_SWAP_PROMPT } from "@/lib/face-swap-preset";
import { SHARPEN_UNBLUR_LORA, SHARPEN_UNBLUR_PROMPT } from "@/lib/sharpen-unblur-preset";

async function png(color = "#146c63") {
  return sharp({ create: { width: 96, height: 64, channels: 3, background: color } }).png().toBuffer();
}

test("creates an image and exposes it in Outputs", async ({ page }) => {
  const prompt = "A bright red observatory above a quiet forest";
  await page.goto("/create-image");
  await page.getByLabel("Prompt", { exact: true }).fill(prompt);
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toHaveValue("20");
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
  const completedJob = page.locator("article").filter({ hasText: prompt });
  await expect(completedJob.getByText("completed", { exact: true })).toBeVisible();
  await completedJob.getByRole("link", { name: "Reuse settings" }).click();
  await expect(page).toHaveURL(/\/create-image\?fromJob=/);
  await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(prompt);
  await expect(page.locator('select[name="loraName"]').nth(0)).toHaveValue("editorial-style.safetensors");
  await expect(page.locator('select[name="loraName"]').nth(1)).toHaveValue("product-photo.sft");
  await expect(page.locator('input[name="loraStrength"]').nth(0)).toHaveValue("0.65");
  await expect(page.locator('input[name="loraStrength"]').nth(1)).toHaveValue("1.1");
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Clear finished" }).click();
  await expect(page.locator("article").filter({ hasText: prompt })).toHaveCount(0);
  await page.goto("/outputs");
  await expect(page.getByText("A bright red observatory above a quiet forest")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download original" }).first()).toHaveAttribute("href", /download=1/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove from outputs" }).first().click();
  await expect(page.getByText("A bright red observatory above a quiet forest")).toHaveCount(0);
});

test("uses conservative Flux Klein image defaults", async ({ page }) => {
  await page.goto("/create-image");
  await expect(page.getByLabel("Guidance (CFG)")).toHaveValue("4");
  await page.getByRole("combobox", { name: "Model", exact: true }).selectOption("flux-klein-9b");
  await expect(page.getByLabel("Resolution")).toHaveValue("1024x1024");
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toHaveValue("4");
  await expect(page.getByLabel("Guidance (CFG)")).toHaveValue("5");
  await expect(page.getByLabel("Resolution").locator("option")).toHaveText(["Square", "Landscape", "Portrait"]);
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByLabel("Solver")).toHaveValue("euler");
  await expect(page.getByLabel("Scheduler")).toHaveValue("normal");
});

test("applies and disables a Qwen Lightning acceleration preset", async ({ page }) => {
  await page.goto("/create-image");
  const guidance = page.getByLabel("Guidance (CFG)");
  const steps = page.getByRole("spinbutton", { name: "Steps", exact: true });
  await expect(guidance).toHaveValue("4");
  await expect(page.getByText("Acceleration presets", { exact: true })).toBeVisible();
  await expect(page.getByText("Other LoRAs", { exact: true })).toBeVisible();
  await page.getByLabel("Acceleration preset").selectOption("fixture-qwen-lightning");
  await expect(guidance).toHaveValue("1");
  await expect(guidance).toBeDisabled();
  await expect(steps).toHaveValue("4");
  await expect(steps).toBeDisabled();
  await expect(page.getByText(/Provided by WanGP/)).toBeVisible();
  const addLora = page.getByRole("button", { name: "Add LoRA" });
  await expect(addLora).toBeEnabled();
  await addLora.click();
  await page.locator('select[name="loraName"]').selectOption("editorial-style.safetensors");
  await page.locator('input[name="loraStrength"]').fill("0.7");
  await expect(page.locator('select[name="loraName"]')).toBeEnabled();
  await page.screenshot({ path: "test-results/desktop-acceleration-preset.png", fullPage: true });
  await page.getByLabel("Acceleration preset").selectOption("");
  await expect(guidance).toHaveValue("4");
  await expect(steps).toHaveValue("20");
  await expect(page.locator('select[name="loraName"]')).toHaveValue("editorial-style.safetensors");
});

test("uploads and edits an image", async ({ page }) => {
  const prompt = "Replace the background with a coral sunrise";
  await page.goto("/edit-image");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "source.png", mimeType: "image/png", buffer: await png() });
  await page.getByLabel("Edit prompt").fill(prompt);
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toHaveValue("20");
  await expect(page.getByLabel("Negative prompt")).toHaveValue(/deformed anatomy/);
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByLabel("Solver").selectOption("dpm++");
  await page.getByLabel("Scheduler").selectOption("karras");
  await page.getByRole("button", { name: "Add LoRA" }).click();
  await page.locator('input[name="loraStrength"]').fill("0.9");
  await page.getByRole("button", { name: "Edit image" }).click();
  await expect(page).toHaveURL(/\/jobs/);
  const completedJob = page.locator("article").filter({ hasText: prompt });
  await expect(completedJob.getByText("completed", { exact: true })).toBeVisible();
  await completedJob.getByRole("link", { name: "Reuse settings" }).click();
  await expect(page).toHaveURL(/\/edit-image\?fromJob=/);
  await expect(page.getByLabel("Edit prompt")).toHaveValue(prompt);
  await expect(page.getByAltText("Selected source preview")).toBeVisible();
  await expect(page.locator('input[name="loraStrength"]')).toHaveValue("0.9");
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByLabel("Solver")).toHaveValue("dpm++");
  await expect(page.getByLabel("Scheduler")).toHaveValue("karras");
});

test("configures and submits a face-swap edit", async ({ page }) => {
  const sourceUploadIds = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
  const referenceUploadId = "00000000-0000-4000-8000-000000000003";
  let uploadCount = 0;
  const submitted: Record<string, unknown>[] = [];
  await page.route("**/api/uploads/image", async (route) => {
    uploadCount += 1;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ upload: { id: uploadCount <= sourceUploadIds.length ? sourceUploadIds[uploadCount - 1] : referenceUploadId } }) });
  });
  await page.route("**/api/jobs/image-edit", async (route) => {
    submitted.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job: { id: crypto.randomUUID() } }) });
  });
  await page.goto("/edit-image");
  await page.waitForLoadState("networkidle");
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles({ name: "source-one.png", mimeType: "image/png", buffer: await png("#e3482d") });
  await expect(page.getByAltText("Selected source preview")).toBeVisible();
  await page.getByRole("switch", { name: /Face swap/ }).check();
  await expect(page.getByRole("heading", { name: "Source images" })).toBeVisible();
  await fileInputs.nth(0).setInputFiles({ name: "source-two.png", mimeType: "image/png", buffer: await png("#dda928") });
  await expect(page.getByLabel("Edit prompt")).toHaveValue(FACE_SWAP_PROMPT);
  await expect(page.getByLabel("Edit prompt")).toHaveAttribute("readonly", "");
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("qwen-image-edit");
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toHaveValue("4");
  await expect(page.getByText("Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors")).toBeVisible();
  await expect(page.getByText("bfs_head_v5_2511_merged_version_rank_16_fp16.safetensors")).toBeVisible();
  await expect(page.getByText("0.8", { exact: true })).toBeVisible();
  await expect(page.getByText("0.5", { exact: true })).toBeVisible();
  const submit = page.getByRole("button", { name: "Start 2 face swaps" });
  await expect(submit).toBeDisabled();
  await fileInputs.nth(1).setInputFiles({ name: "face.png", mimeType: "image/png", buffer: await png("#146c63") });
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: "test-results/desktop-face-swap.png", fullPage: true });
  await submit.click();
  await expect(page).toHaveURL(/\/jobs/);
  expect(submitted).toHaveLength(2);
  expect(submitted.map((request) => request.sourceUploadId)).toEqual(sourceUploadIds);
  for (const request of submitted) expect(request).toMatchObject({ referenceUploadIds: [referenceUploadId], referenceAssetIds: [], faceSwap: true, prompt: FACE_SWAP_PROMPT, modelKey: "qwen-image-edit", steps: 4, loras: [] });
});

test("generates and serves an LTX-2 video", async ({ page }) => {
  const prompt = "A slow cinematic push toward the horizon";
  await page.goto("/create-video");
  await expect(page.getByLabel("Duration")).toHaveValue("15");
  await expect(page.getByLabel("Duration")).toHaveAttribute("min", "1");
  await expect(page.getByLabel("Duration")).toHaveAttribute("max", "20");
  const sourceStrength = page.getByRole("slider", { name: "Start image / source strength" });
  await expect(sourceStrength).toHaveValue("0.85");
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toHaveValue("8");
  await expect(page.getByLabel("Negative prompt")).toHaveValue(/deformed anatomy/);
  await page.getByLabel("Duration").fill("6");
  await sourceStrength.focus();
  await sourceStrength.press("Home");
  for (let step = 0; step < 8; step += 1) await sourceStrength.press("ArrowRight");
  await expect(sourceStrength).toHaveValue("0.4");
  await page.getByRole("spinbutton", { name: "Steps", exact: true }).fill("9");
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByLabel("Solver").selectOption("euler");
  await page.getByLabel("Scheduler").selectOption("karras");
  await page.getByRole("group", { name: "Start image *" }).locator('input[type="file"]').setInputFiles({ name: "start.png", mimeType: "image/png", buffer: await png("#dda928") });
  await page.getByLabel("Video prompt").fill(prompt);
  await page.getByRole("button", { name: "Add LoRA" }).click();
  await page.locator('select[name="loraName"]').selectOption("cinematic-motion.safetensors");
  await page.locator('input[name="loraStrength"]').fill("0.8");
  const submittedRequest = page.waitForRequest((request) => request.url().endsWith("/api/jobs/video-create") && request.method() === "POST");
  await page.getByRole("button", { name: "Generate video" }).click();
  const submitted = (await submittedRequest).postDataJSON();
  expect(submitted).toMatchObject({ durationSeconds: 6, sourceStrength: 0.4, steps: 9, fps: 24, guidanceScale: 3, sampleSolver: "euler", scheduler: "karras" });
  const completedJob = page.locator("article").filter({ hasText: prompt });
  await expect(completedJob.getByText("completed", { exact: true })).toBeVisible();
  await completedJob.getByRole("link", { name: "Reuse settings" }).click();
  await expect(page).toHaveURL(/\/create-video\?fromJob=/);
  await expect(page.getByLabel("Video prompt")).toHaveValue(prompt);
  await expect(page.getByLabel("Duration")).toHaveValue("6");
  await expect(page.getByRole("slider", { name: "Start image / source strength" })).toHaveValue("0.4");
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toHaveValue("9");
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByLabel("Solver")).toHaveValue("euler");
  await expect(page.getByLabel("Scheduler")).toHaveValue("karras");
  await expect(page.getByAltText("Start image preview")).toBeVisible();
  await expect(page.locator('select[name="loraName"]')).toHaveValue("cinematic-motion.safetensors");
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

test("shows exact WanGP model selections in Settings", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Approved models", exact: true })).toBeVisible();
  const selectors = page.getByLabel("WanGP model");
  await expect(selectors).toHaveCount(5);
  await expect(page.getByText(/qwen_image_edit_fixture/)).toBeVisible();
  await expect(page.getByText(/ltx2_fixture/)).toBeVisible();
});

test("inserts the default character into an existing image prompt", async ({ page }) => {
  const settings = await (await page.request.get("/api/settings")).json();
  const savedCharacterPrompt = String(settings.preferences.characterPrompt);
  await page.goto("/create-image");
  const prompt = page.getByLabel("Prompt", { exact: true });
  await prompt.fill("Standing at the beach at sunset.");
  await page.getByRole("button", { name: "Insert character" }).click();
  await expect(prompt).toHaveValue(`Standing at the beach at sunset. ${savedCharacterPrompt}`);
});

test("saves an edited default character prompt", async ({ page }) => {
  const customPrompt = "A recurring character with silver hair and green eyes.";
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/api/settings/preferences", async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences: submitted }) });
  });
  await page.goto("/settings");
  await expect(page.getByLabel("Default character prompt")).not.toHaveValue("");
  await page.screenshot({ path: "test-results/desktop-character-prompt-settings.png", fullPage: true });
  await page.getByLabel("Default character prompt").fill(customPrompt);
  await page.getByRole("button", { name: "Save character prompt" }).click();
  await expect(page.getByRole("status")).toHaveText("Character prompt saved.");
  expect(submitted).toEqual({ characterPrompt: customPrompt });
});

test("configures and submits the exclusive Sharpen and Unblur preset", async ({ page }) => {
  const sourceUploadIds = ["00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"];
  let uploadCount = 0;
  const submitted: Record<string, unknown>[] = [];
  await page.route("**/api/uploads/image", async (route) => {
    const sourceUploadId = sourceUploadIds[uploadCount];
    uploadCount += 1;
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ upload: { id: sourceUploadId } }) });
  });
  await page.route("**/api/jobs/image-edit", async (route) => { submitted.push(route.request().postDataJSON() as Record<string, unknown>); await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job: { id: crypto.randomUUID() } }) }); });
  await page.goto("/edit-image");
  await page.getByLabel("Edit prompt").fill("Sharpen and restore fine detail");
  const sharpenToggle = page.getByRole("switch", { name: /Sharpen and Unblur/ });
  await sharpenToggle.check();
  await expect(page.getByLabel("Edit prompt")).toHaveValue(SHARPEN_UNBLUR_PROMPT);
  await sharpenToggle.uncheck();
  await expect(page.getByLabel("Edit prompt")).toHaveValue("Sharpen and restore fine detail");
  await sharpenToggle.check();
  await expect(page.getByLabel("Edit prompt")).toHaveValue(SHARPEN_UNBLUR_PROMPT);
  await expect(page.getByRole("heading", { name: "Source images" })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: "soft-one.png", mimeType: "image/png", buffer: await png("#777777") },
    { name: "soft-two.png", mimeType: "image/png", buffer: await png("#999999") },
  ]);
  await expect(page.getByRole("switch", { name: /Face swap/ })).not.toBeChecked();
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toHaveValue("qwen-image-edit");
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toHaveValue("20");
  await expect(page.getByRole("spinbutton", { name: "Steps", exact: true })).toBeEnabled();
  await expect(page.getByText(SHARPEN_UNBLUR_LORA.name, { exact: true })).toBeVisible();
  await expect(page.getByText("Sharpen and Unblur LoRA", { exact: true }).locator("..").getByText("1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add LoRA" })).toHaveCount(0);
  await expect(page.getByLabel("Acceleration preset")).toHaveCount(0);
  await page.screenshot({ path: "test-results/desktop-sharpen-unblur.png", fullPage: true });
  await page.getByRole("button", { name: "Sharpen 2 images" }).click();
  await expect(page).toHaveURL(/\/jobs/);
  expect(submitted).toHaveLength(2);
  expect(submitted.map((request) => request.sourceUploadId)).toEqual(sourceUploadIds);
  for (const request of submitted) {
    expect(request).toMatchObject({ faceSwap: false, sharpenUnblur: true, prompt: SHARPEN_UNBLUR_PROMPT, modelKey: "qwen-image-edit", steps: 20, loras: [] });
    expect(request).not.toHaveProperty("loraPresetId");
  }
});