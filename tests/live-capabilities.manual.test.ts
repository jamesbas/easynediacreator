import { describe, expect, it } from "vitest";
import { discoverModels } from "@/lib/wan-gp/discovery";
import { LiveWanGpClient } from "@/lib/wan-gp/live-client";
import { supportsTextToImage } from "@/lib/wan-gp/text-to-image";
import { DEFAULT_MODEL_SELECTIONS } from "@/lib/runtime/model-preferences";

describe.runIf(process.env.WANGP_LIVE_TEST === "true")("live capability names", () => {
  it("still reads text-to-image and text-to-video off the installed models", async () => {
    const client = new LiveWanGpClient(process.env.WANGP_MCP_URL ?? "http://127.0.0.1:7866/mcp", process.env.WANGP_LORA_ROOT);
    const models = await discoverModels(client, DEFAULT_MODEL_SELECTIONS);

    const edit = models.filter((model) => model.workflowType === "image-edit" && model.availability === "available");
    expect(edit.length).toBeGreaterThan(0);
    // Without this the Edit page hides "Skip the source image" entirely.
    expect(edit.some(supportsTextToImage)).toBe(true);

    const video = models.filter((model) => model.workflowType === "video-create" && model.availability === "available");
    expect(video.some((model) => model.capabilities.includes("text-to-video"))).toBe(true);
    for (const model of video) expect(model.capabilities.every((name) => !name.includes("_"))).toBe(true);
  }, 120_000);
});
