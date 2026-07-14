import { beforeEach, describe, expect, it } from "vitest";
import { getJob, resetJobsForTests } from "@/lib/runtime/job-registry";
import { getOutput, publicAsset, resetOutputsForTests } from "@/lib/runtime/output-registry";
import { createImage } from "@/lib/services/image-create-service";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";

describe("image creation", () => {
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); setWanGpClientForTests(new FakeWanGpClient()); });
  it("runs a queued image job and exposes only an opaque output handle", async () => {
    const client = new FakeWanGpClient();
    setWanGpClientForTests(client);
    const created = await createImage({ prompt: "A lighthouse at blue hour", negativePrompt: "blurry, deformed anatomy", modelKey: "qwen-image", count: 1, steps: 20, loras: [{ name: "editorial-style.safetensors", strength: 0.65 }, { name: "product-photo.sft", strength: 1.1 }], advanced: {} });
    const deadline = Date.now() + 4000;
    while (getJob(created.id)?.status !== "completed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    const completed = getJob(created.id);
    expect(completed?.status).toBe("completed");
    const asset = getOutput(completed?.outputIds?.[0] ?? "");
    expect(asset).toBeDefined();
    expect(publicAsset(asset!)).not.toHaveProperty("path");
    expect(publicAsset(asset!).contentUrl).toMatch(/^\/api\/assets\/[a-f0-9-]+\/content$/);
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ negative_prompt: "blurry, deformed anatomy", num_inference_steps: 20, activated_loras: ["editorial-style.safetensors", "product-photo.sft"], loras_multipliers: "0.65 1.1" });
  }, 5000);
});