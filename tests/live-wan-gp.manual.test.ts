import { describe, expect, it } from "vitest";
import { discoverModels } from "@/lib/wan-gp/discovery";
import { buildLtx2VideoSettings } from "@/lib/wan-gp/adapters/ltx2-video";
import { buildQwenImageEditSettings } from "@/lib/wan-gp/adapters/qwen-image-edit";
import { LiveWanGpClient } from "@/lib/wan-gp/live-client";
import { DEFAULT_MODEL_SELECTIONS } from "@/lib/runtime/model-preferences";

const runLive = process.env.WANGP_LIVE_TEST === "true";

describe.runIf(runLive)("live WanGP MCP", () => {
  const endpoint = process.env.WANGP_MCP_URL ?? "http://127.0.0.1:7866/mcp";
  const client = new LiveWanGpClient(endpoint, process.env.WANGP_LORA_ROOT);

  it("discovers image and video models", async () => {
    await expect(client.listModels("image")).resolves.not.toHaveLength(0);
    await expect(client.listModels("video")).resolves.not.toHaveLength(0);
  });

  it("resolves configured application models", async () => {
    const models = await discoverModels(client, DEFAULT_MODEL_SELECTIONS);
    expect(models.find((model) => model.workflowType === "image-edit" && model.key === "qwen-image-edit")?.modelType).toBe("qwen_image_edit_plus2_20B");
    expect(models.find((model) => model.workflowType === "video-create")?.modelType).toBe("ltx2_22B_distilled_1_1");
  });

  it("builds LTX start-image settings with a discovered LoRA", async () => {
    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "video-create");
    expect(model?.modelType).toBeTruthy(); expect(model?.loraCatalog.loras.length).toBeGreaterThan(0);
    const lora = model!.loraCatalog.loras[0];
    const settings = buildLtx2VideoSettings(
      { prompt: "Camera push", negativePrompt: "blurry", modelKey: "ltx-2", startAssetId: crypto.randomUUID(), durationSeconds: 15, sourceStrength: 0.85, steps: 8, loras: [{ name: lora, strength: 0.8 }], advanced: {} },
      model!.defaults, model!.schema, model!.modelType!, "C:\\input\\start.png",
    );
    expect(settings).toMatchObject({ image_prompt_type: "S", image_start: "C:\\input\\start.png", video_length: 361, duration_seconds: 0, input_video_strength: 0.85, num_inference_steps: 8, activated_loras: [lora], loras_multipliers: "0.8" });
  });

  it("builds Qwen image-edit settings with a source reference", async () => {
    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "image-edit" && candidate.key === "qwen-image-edit");
    expect(model?.modelType).toBeTruthy();
    const sourcePath = "C:\\input\\source.png";
    const settings = buildQwenImageEditSettings(
      { sourceAssetId: crypto.randomUUID(), referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, prompt: "Change the sky", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} },
      model!.defaults, model!.schema, model!.modelType!, sourcePath,
    );
    expect(settings).toMatchObject({ image_mode: 1, image_refs: [sourcePath], video_prompt_type: "KI", num_inference_steps: 20 });
  });
});
