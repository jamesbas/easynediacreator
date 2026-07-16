import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { getJob, resetJobsForTests } from "@/lib/runtime/job-registry";
import { clearModelCache } from "@/lib/runtime/model-cache";
import { getOutput, resetOutputsForTests } from "@/lib/runtime/output-registry";
import { createVideo } from "@/lib/services/video-create-service";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";

describe("video creation", () => {
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); clearModelCache(); setWanGpClientForTests(new FakeWanGpClient()); });
  it("generates a browser-compatible MP4 from a validated start image", async () => {
    const client = new FakeWanGpClient();
    setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#dda928" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    const created = await createVideo({ startUploadId: upload.id, prompt: "Slow camera push", negativePrompt: "blurry, jittery frames", modelKey: "ltx-2", durationSeconds: 15, sourceStrength: 0.6, steps: 8, loras: [{ name: "cinematic-motion.safetensors", strength: 0.8 }], advanced: {} });
    const deadline = Date.now() + 8000;
    while (getJob(created.id)?.status !== "completed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    const job = getJob(created.id);
    expect(job?.status).toBe("completed");
    expect(getOutput(job?.outputIds?.[0] ?? "")).toMatchObject({ type: "video", workflowType: "video-create", filename: expect.stringMatching(/\.mp4$/) });
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ video_length: 361, input_video_strength: 0.6, num_inference_steps: 8, negative_prompt: "blurry, jittery frames", activated_loras: ["cinematic-motion.safetensors"], loras_multipliers: "0.8" });
  }, 10000);

  it("rejects video values outside the selected model constraints", async () => {
    const buffer = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#dda928" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    const base = { startUploadId: upload.id, prompt: "Invalid controls", negativePrompt: "blurry", modelKey: "ltx-2", durationSeconds: 15, sourceStrength: 0.6, steps: 8, loras: [], advanced: {} };
    await expect(createVideo({ ...base, durationSeconds: 21 })).rejects.toThrow(/Duration/);
    await expect(createVideo({ ...base, fps: 61 })).rejects.toThrow(/FPS/);
    await expect(createVideo({ ...base, sampleSolver: "unknown" })).rejects.toThrow(/Solver/);
  });

  it("accepts an LTX-2 1080p fallback when MCP omits resolution choices", async () => {
    class LtxResolutionFallbackClient extends FakeWanGpClient {
      override async getModelSchema(modelType: string) {
        const schema = await super.getModelSchema(modelType);
        if (modelType !== "ltx2_fixture") return schema;
        const modelDefinition = { ...schema.model_def as Record<string, unknown> };
        delete modelDefinition.resolutions;
        const fallbackSchema: Record<string, unknown> = { ...schema, model_def: modelDefinition };
        delete fallbackSchema.resolutions;
        return fallbackSchema;
      }
    }
    const client = new LtxResolutionFallbackClient();
    setWanGpClientForTests(client);
    const buffer = await sharp({ create: { width: 64, height: 36, channels: 3, background: "#dda928" } }).png().toBuffer();
    const upload = await storeImageUpload(buffer, await validateImageBuffer(buffer));
    await createVideo({ startUploadId: upload.id, prompt: "Vertical camera move", negativePrompt: "blurry", modelKey: "ltx-2", resolution: "1088x1920", durationSeconds: 15, sourceStrength: 0.6, steps: 8, loras: [], advanced: {} });
    const deadline = Date.now() + 1000;
    while (!client.getLastSubmissionForTests() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getLastSubmissionForTests()?.settings.resolution).toBe("1088x1920");
  });
});