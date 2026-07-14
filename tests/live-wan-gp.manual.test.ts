import { describe, expect, it } from "vitest";
import { discoverModels } from "@/lib/wan-gp/discovery";
import { buildLtx2VideoSettings } from "@/lib/wan-gp/adapters/ltx2-video";
import { LiveWanGpClient } from "@/lib/wan-gp/live-client";

const runLive = process.env.WANGP_LIVE_TEST === "true";

describe.runIf(runLive)("live WanGP MCP", () => {
  const endpoint = process.env.WANGP_MCP_URL ?? "http://127.0.0.1:7866/mcp";
  const client = new LiveWanGpClient(endpoint, process.env.WANGP_LORA_ROOT);

  it("discovers image and video models", async () => {
    await expect(client.listModels("image")).resolves.not.toHaveLength(0);
    await expect(client.listModels("video")).resolves.not.toHaveLength(0);
  });

  it("resolves configured application models", async () => {
    const models = await discoverModels(client);
    expect(models).not.toHaveLength(0);
  });

  it("builds LTX start-image settings with a discovered LoRA", async () => {
    const model = (await discoverModels(client)).find((candidate) => candidate.workflowType === "video-create");
    expect(model?.modelType).toBeTruthy(); expect(model?.loraCatalog.loras.length).toBeGreaterThan(0);
    const lora = model!.loraCatalog.loras[0];
    const settings = buildLtx2VideoSettings(
      { prompt: "Camera push", negativePrompt: "blurry", modelKey: "ltx-2", startAssetId: crypto.randomUUID(), steps: 20, loras: [{ name: lora, strength: 0.8 }], advanced: {} },
      model!.defaults, model!.schema, model!.modelType!, "C:\\input\\start.png",
    );
    expect(settings).toMatchObject({ image_prompt_type: "S", image_start: "C:\\input\\start.png", activated_loras: [lora], loras_multipliers: "0.8" });
  });
});
