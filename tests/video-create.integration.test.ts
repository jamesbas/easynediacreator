import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { getJob, resetJobsForTests } from "@/lib/runtime/job-registry";
import { getOutput, resetOutputsForTests } from "@/lib/runtime/output-registry";
import { createVideo } from "@/lib/services/video-create-service";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";

describe("video creation", () => {
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); setWanGpClientForTests(new FakeWanGpClient()); });
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
});