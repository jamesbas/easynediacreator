import { describe, expect, it } from "vitest";
import { FACE_SWAP_LORAS } from "@/lib/face-swap-preset";
import { discoverModels } from "@/lib/wan-gp/discovery";
import { buildFluxKleinImageSettings } from "@/lib/wan-gp/adapters/flux-klein-image";
import { buildKrea2ImageEditSettings } from "@/lib/wan-gp/adapters/krea2-image-edit";
import { buildLtx2VideoSettings } from "@/lib/wan-gp/adapters/ltx2-video";
import { buildVideoSettings } from "@/lib/wan-gp/adapters/video";
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

  it("discovers and adapts a non-LTX text-to-video model", async () => {
    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "video-create" && !candidate.modelType?.toLowerCase().startsWith("ltx2"));
    expect(model?.modelType).toBeTruthy();

    const settings = buildVideoSettings(
      { prompt: "Clouds crossing a mountain", negativePrompt: "blurry", modelKey: model!.key, durationSeconds: 5, sourceStrength: 0.85, steps: 8, loras: [], advanced: {} },
      model!.defaults,
      model!.schema,
      model!.modelType!,
    );
    expect(settings.prompt).toBe("Clouds crossing a mountain");
    expect(settings).not.toHaveProperty("image_start");
  });

  it("builds current Flux Klein settings without image_mode or CFG", async () => {
    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "image-create" && candidate.key === "flux-klein-9b");
    expect(model?.modelType).toBeTruthy();

    const settings = buildFluxKleinImageSettings(
      { prompt: "A lighthouse at sunset", negativePrompt: "blurry", modelKey: "flux-klein-9b", count: 1, steps: 4, loras: [], advanced: {} },
      model!.defaults,
      model!.schema,
      model!.modelType!,
    );
    expect(settings).not.toHaveProperty("image_mode");
    expect(settings).not.toHaveProperty("guidance_scale");
  });

  it("builds current Krea Turbo Edit settings without CFG", async () => {    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "image-edit" && candidate.key === "krea-2-edit");
    expect(model?.modelType).toBe("krea2_turbo_edit");

    const settings = buildKrea2ImageEditSettings(
      { prompt: "Make the coat red", negativePrompt: "", modelKey: "krea-2-edit", steps: 8, guidanceScale: 0, faceSwap: false, sharpenUnblur: false, loras: [], advanced: {} },
      model!.defaults,
      model!.schema,
      model!.modelType!,
      "C:\\input\\source.png",
    );
    expect(settings).not.toHaveProperty("guidance_scale");
    expect(settings).not.toHaveProperty("cfg_scale");
  });

  it("builds LTX start-image settings with a discovered LoRA", async () => {
    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "video-create");
    expect(model?.modelType).toBeTruthy(); expect(model?.loraCatalog.loras.length).toBeGreaterThan(0);
    const lora = model!.loraCatalog.loras[0];
    const settings = buildLtx2VideoSettings(
      { prompt: "Camera push", negativePrompt: "blurry", modelKey: "ltx-2", startAssetId: crypto.randomUUID(), durationSeconds: 15, sourceStrength: 0.85, steps: 8, loras: [{ name: lora, strength: 0.8 }], advanced: {} },
      model!.defaults, model!.schema, model!.modelType!, "C:\\input\\start.png",
    );
    expect(settings).toMatchObject({ image_prompt_type: "S", image_start: "C:\\input\\start.png", video_length: 361, input_video_strength: 0.85, num_inference_steps: 8, activated_loras: [lora], loras_multipliers: "0.8" });
    expect(settings).not.toHaveProperty("duration_seconds");
  });

  it("builds Qwen image-edit settings with a source reference", async () => {
    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "image-edit" && candidate.key === "qwen-image-edit");
    expect(model?.modelType).toBeTruthy();
    const sourcePath = "C:\\input\\source.png";
    const settings = buildQwenImageEditSettings(
      { sourceAssetId: crypto.randomUUID(), referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false, prompt: "Change the sky", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} },
      model!.defaults, model!.schema, model!.modelType!, sourcePath, ["C:\\input\\reference.png"],
    );
    expect(settings).toMatchObject({ image_refs: [sourcePath, "C:\\input\\reference.png"], video_prompt_type: "KI", num_inference_steps: 20 });
    expect(settings).not.toHaveProperty("image_guide");
  });

  it("builds a Qwen face swap against the current schema", async () => {
    const model = (await discoverModels(client, DEFAULT_MODEL_SELECTIONS)).find((candidate) => candidate.workflowType === "image-edit" && candidate.key === "qwen-image-edit");
    expect(model?.modelType).toBeTruthy();
    const settings = buildQwenImageEditSettings(
      { sourceAssetId: crypto.randomUUID(), referenceUploadIds: [crypto.randomUUID()], referenceAssetIds: [], faceSwap: true, sharpenUnblur: false, prompt: "replaced server-side", negativePrompt: "blurry", modelKey: "qwen-image-edit", steps: 20, loras: [], advanced: {} },
      model!.defaults, model!.schema, model!.modelType!, "C:\\input\\source.png", ["C:\\input\\face.png"],
    );
    expect(settings).toMatchObject({ sample_solver: "lightning", activated_loras: FACE_SWAP_LORAS.map((lora) => lora.name) });
    expect(settings).not.toHaveProperty("mask_expand");
  });
});
