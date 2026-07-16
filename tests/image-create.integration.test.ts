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

  it("recovers from a transient WanGP polling failure", async () => {
    class FlakyWanGpClient extends FakeWanGpClient {
      private failedOnce = false;
      override async getJob(jobId: string) {
        if (!this.failedOnce) { this.failedOnce = true; throw new Error("Temporary MCP transport failure"); }
        return super.getJob(jobId);
      }
    }
    const client = new FlakyWanGpClient();
    setWanGpClientForTests(client);
    const created = await createImage({ prompt: "A resilient lighthouse", negativePrompt: "blurry", modelKey: "qwen-image", count: 1, steps: 20, loras: [], advanced: {} });
    const deadline = Date.now() + 5000;
    while (getJob(created.id)?.status !== "completed" && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    expect(getJob(created.id)?.status).toBe("completed");
  }, 6000);

  it("applies a server-owned acceleration preset over conflicting request settings", async () => {
    const client = new FakeWanGpClient(); setWanGpClientForTests(client);
    await createImage({ prompt: "Fast portrait", negativePrompt: "blurry", modelKey: "qwen-image", count: 1, steps: 30, guidanceScale: 7, loraPresetId: "fixture-qwen-lightning", loras: [{ name: "editorial-style.safetensors", strength: 0.65 }], advanced: {} });
    expect(client.getLastSubmissionForTests()?.settings).toMatchObject({ activated_loras: ["Qwen-Lightning-4steps.safetensors", "editorial-style.safetensors"], loras_multipliers: "1 0.65", num_inference_steps: 4, guidance_scale: 1, sample_solver: "lightning" });
  });

  it("rejects controls outside the selected model schema", async () => {
    const base = { prompt: "Invalid controls", negativePrompt: "blurry", modelKey: "qwen-image", count: 1, steps: 20, loras: [], advanced: {} };
    await expect(createImage({ ...base, resolution: "640x480" })).rejects.toThrow(/Resolution/);
    await expect(createImage({ ...base, steps: 201 })).rejects.toThrow(/Steps/);
    await expect(createImage({ ...base, guidanceScale: 31 })).rejects.toThrow(/Guidance/);
    await expect(createImage({ ...base, sampleSolver: "unknown" })).rejects.toThrow(/Solver/);
    await expect(createImage({ ...base, scheduler: "unknown" })).rejects.toThrow(/Scheduler/);
  });
});