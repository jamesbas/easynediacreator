import { describe, expect, it } from "vitest";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";

describe("FakeWanGpClient", () => {
  it("offers deterministic image and video discovery", async () => {
    const client = new FakeWanGpClient();
    expect((await client.listModels("image")).map((model) => model.name)).toEqual(["Qwen Image", "Qwen Image Edit", "Flux.2 Klein 9B"]);
    const videos = await client.listModels("video");
    expect(videos).toHaveLength(1);
    await expect(client.getModelSchema(videos[0].modelType)).resolves.toMatchObject({ supportsEndFrame: true });
  });
  it("creates and cancels a fixture job", async () => {
    const client = new FakeWanGpClient();
    const { jobId } = await client.generate("qwen_image_fixture", { prompt: "Test" });
    expect((await client.getJob(jobId)).status).toBe("queued");
    await client.cancelJob(jobId);
    expect((await client.getJob(jobId)).status).toBe("cancelled");
  });
});