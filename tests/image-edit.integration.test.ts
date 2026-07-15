import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { getJob, resetJobsForTests } from "@/lib/runtime/job-registry";
import { resetOutputsForTests } from "@/lib/runtime/output-registry";
import { editImage } from "@/lib/services/image-edit-service";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";
import { FACE_SWAP_LORAS, FACE_SWAP_PROMPT } from "@/lib/face-swap-preset";
import { SHARPEN_UNBLUR_LORA } from "@/lib/sharpen-unblur-preset";

describe("image editing", () => {
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); setWanGpClientForTests(new FakeWanGpClient()); });
  it("edits a validated uploaded image through the GPU queue", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e3482d" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    const created = await editImage({ sourceUploadId: upload.id, referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "Turn the sky teal", negativePrompt: "blurry, malformed hands", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 4000;
    while (getJob(created.id)?.status !== "completed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getJob(created.id)).toMatchObject({ status: "completed", workflowType: "image-edit" });
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ negative_prompt: "blurry, malformed hands", num_inference_steps: 20, video_prompt_type: "KI", image_refs: [upload.path] });
  }, 5000);

  it("submits a Qwen face swap with separate base and reference images", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const baseBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e3482d" } }).png().toBuffer();
    const referenceBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#146c63" } }).png().toBuffer();
    const source = await storeImageUpload(baseBuffer, await validateImageBuffer(baseBuffer));
    const reference = await storeImageUpload(referenceBuffer, await validateImageBuffer(referenceBuffer));
    await editImage({ sourceUploadId: source.id, referenceUploadIds: [reference.id], referenceAssetIds: [], faceSwap: true, sharpenUnblur: false, prompt: "replaced server-side", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} });
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({
      prompt: FACE_SWAP_PROMPT,
      image_mode: 1,
      image_guide: source.path,
      image_refs: [reference.path],
      image_prompt_type: "",
      video_prompt_type: "IV",
      image_refs_relative_size: 50,
      remove_background_images_ref: 1,
      num_inference_steps: 4,
      sample_solver: "lightning",
      activated_loras: FACE_SWAP_LORAS.map((lora) => lora.name),
      loras_multipliers: "0.8 0.5",
    });
  });

  it("submits the exclusive Qwen Sharpen and Unblur LoRA at strength 1", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#777777" } }).png().toBuffer();
    const source = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    await editImage({ sourceUploadId: source.id, referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: true, prompt: "Sharpen and restore detail", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 4000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ prompt: "Sharpen and restore detail", image_refs: [source.path], video_prompt_type: "KI", num_inference_steps: 20, activated_loras: [SHARPEN_UNBLUR_LORA.name], loras_multipliers: "1" });
  });
});