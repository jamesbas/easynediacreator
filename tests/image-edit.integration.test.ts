import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { getJob, resetJobsForTests } from "@/lib/runtime/job-registry";
import { clearModelCache } from "@/lib/runtime/model-cache";
import { resetOutputsForTests } from "@/lib/runtime/output-registry";
import { editImage } from "@/lib/services/image-edit-service";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";
import { FACE_SWAP_LORAS, FACE_SWAP_PROMPT, faceSwapPrompt } from "@/lib/face-swap-preset";
import { SHARPEN_UNBLUR_LORA } from "@/lib/sharpen-unblur-preset";

describe("image editing", () => {
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); clearModelCache(); setWanGpClientForTests(new FakeWanGpClient()); });
  it("edits a validated uploaded image through the GPU queue", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e3482d" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    const created = await editImage({ sourceUploadId: upload.id, referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "Turn the sky teal", negativePrompt: "blurry, malformed hands", modelKey: "qwen-image-edit", steps: 20, guidanceScale: 3, sampleSolver: "dpm++", scheduler: "karras", loras: [], advanced: {} });
    const deadline = Date.now() + 4000;
    while (getJob(created.id)?.status !== "completed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getJob(created.id)).toMatchObject({ status: "completed", workflowType: "image-edit" });
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ negative_prompt: "blurry, malformed hands", num_inference_steps: 20, guidance_scale: 3, sample_solver: "dpm++", scheduler_type: "karras", video_prompt_type: "KI", image_refs: [upload.path] });
  }, 5000);

  it("rejects edit controls outside the selected model schema", async () => {
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e3482d" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    const base = { sourceUploadId: upload.id, referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "Invalid controls", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} };
    await expect(editImage({ ...base, resolution: "640x480" })).rejects.toThrow(/Resolution/);
    await expect(editImage({ ...base, steps: 201 })).rejects.toThrow(/Steps/);
    await expect(editImage({ ...base, sampleSolver: "unknown" })).rejects.toThrow(/Solver/);
  });

  it("accepts a Qwen edit 1080p fallback when MCP omits resolution choices", async () => {
    class QwenEditResolutionFallbackClient extends FakeWanGpClient {
      override async getModelSchema(modelType: string) {
        const schema = await super.getModelSchema(modelType);
        if (modelType !== "qwen_image_edit_fixture") return schema;
        const modelDefinition = { ...schema.model_def as Record<string, unknown> };
        delete modelDefinition.resolutions;
        const fallbackSchema: Record<string, unknown> = { ...schema, model_def: modelDefinition };
        delete fallbackSchema.resolutions;
        return fallbackSchema;
      }
    }
    const client = new QwenEditResolutionFallbackClient();
    setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e3482d" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    await editImage({ sourceUploadId: upload.id, referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "Make it vertical", negativePrompt: "blurry", modelKey: "qwen-image-edit", resolution: "1088x1920", steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 1000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getLastSubmissionForTests()?.settings.resolution).toBe("1088x1920");
  });

  it("accepts the Krea 2 edit fallback resolutions the form offers", async () => {
    // WanGP publishes `resolutions_categories: ["<=2k"]` for krea2 instead of a
    // list, so without the shared fallback the only accepted value would be the
    // model's own saved default.
    class Krea2EditResolutionFallbackClient extends FakeWanGpClient {
      override async getModelSchema(modelType: string) {
        const schema = await super.getModelSchema(modelType);
        if (modelType !== "krea2_turbo_edit_fixture") return schema;
        const modelDefinition = { ...schema.model_def as Record<string, unknown> };
        delete modelDefinition.resolutions;
        const fallbackSchema: Record<string, unknown> = { ...schema, model_def: modelDefinition };
        delete fallbackSchema.resolutions;
        return fallbackSchema;
      }
      override async getDefaultSettings(modelType: string) {
        return { ...await super.getDefaultSettings(modelType), resolution: "1920x1088" };
      }
    }
    const client = new Krea2EditResolutionFallbackClient();
    setWanGpClientForTests(client);
    await editImage({ referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "A fox in fresh snow", negativePrompt: "blurry", modelKey: "krea-2-edit", resolution: "2048x1152", steps: 8, loras: [], advanced: {} });
    const deadline = Date.now() + 1000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getLastSubmissionForTests()?.settings.resolution).toBe("2048x1152");
  });

  it("submits a Qwen face swap with separate base and reference images", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const baseBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#e3482d" } }).png().toBuffer();
    const referenceBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#146c63" } }).png().toBuffer();
    const source = await storeImageUpload(baseBuffer, await validateImageBuffer(baseBuffer));
    const reference = await storeImageUpload(referenceBuffer, await validateImageBuffer(referenceBuffer));
    await editImage({ sourceUploadId: source.id, referenceUploadIds: [reference.id], referenceAssetIds: [], faceSwap: true, sharpenUnblur: false, prompt: "replaced server-side", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 1000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({
      prompt: FACE_SWAP_PROMPT,
      image_refs: [source.path, reference.path],
      video_prompt_type: "KI",
      image_refs_relative_size: 50,
      remove_background_images_ref: 1,
      num_inference_steps: 4,
      sample_solver: "lightning",
      activated_loras: FACE_SWAP_LORAS.map((lora) => lora.name),
      loras_multipliers: "0.8 0.5",
    });
  });

  it("swaps the subject noun in the face-swap prompt for a male character", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const baseBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#2d5be3" } }).png().toBuffer();
    const referenceBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#63146c" } }).png().toBuffer();
    const source = await storeImageUpload(baseBuffer, await validateImageBuffer(baseBuffer));
    const reference = await storeImageUpload(referenceBuffer, await validateImageBuffer(referenceBuffer));
    await editImage({ sourceUploadId: source.id, referenceUploadIds: [reference.id], referenceAssetIds: [], faceSwap: true, faceSwapGender: "male", sharpenUnblur: false, prompt: "replaced server-side", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 1000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    const prompt = String((client.getLastSubmissionForTests()?.settings as Record<string, unknown>).prompt);
    expect(prompt).toBe(faceSwapPrompt("male"));
    expect(prompt).toContain("replace it with the head of the white man from Picture 2");
    expect(prompt).not.toContain("woman");
  });

  it("renders from the prompt alone when the source image is skipped", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    await editImage({ referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "A fox in fresh snow", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 1000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ prompt: "A fox in fresh snow", image_mode: 1, image_guide: null, image_refs: [], image_prompt_type: "", video_prompt_type: "" });
  });

  it("keeps references as subjects when the source image is skipped", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#146c63" } }).png().toBuffer();
    const reference = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    await editImage({ referenceUploadIds: [reference.id], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "Put her on a beach", negativePrompt: "blurry", modelKey: "krea-2-edit", steps: 8, loras: [], advanced: {} });
    const deadline = Date.now() + 1000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ image_refs: [reference.path], video_prompt_type: "I", remove_background_images_ref: 1 });
  });

  it("rejects a skipped source on a model that cannot render from text", async () => {
    class ImageOnlyClient extends FakeWanGpClient {
      override async getModelMetadata(modelType: string) { return { ...await super.getModelMetadata(modelType), capabilities: [] }; }
    }
    setWanGpClientForTests(new ImageOnlyClient());
    await expect(editImage({ referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "A fox in fresh snow", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} })).rejects.toThrow(/requires a source image/);
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