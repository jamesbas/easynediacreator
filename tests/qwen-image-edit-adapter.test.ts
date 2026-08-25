import { describe, expect, it } from "vitest";
import { FACE_SWAP_LORAS } from "@/lib/face-swap-preset";
import { buildQwenImageEditSettings } from "@/lib/wan-gp/adapters/qwen-image-edit";

const request = {
  sourceAssetId: crypto.randomUUID(),
  referenceUploadIds: [crypto.randomUUID()],
  referenceAssetIds: [],
  faceSwap: false,
  sharpenUnblur: false,
  prompt: "Update the portrait",
  negativePrompt: "blurry",
  modelKey: "qwen-image-edit",
  steps: 20,
  loras: [],
  advanced: {},
};

describe("Qwen image-edit settings", () => {
  it("uses the current ordered-reference contract", () => {
    const settings = buildQwenImageEditSettings(
      request,
      { prompt: "", negative_prompt: "", video_prompt_type: "", num_inference_steps: 20 },
      { metadata: { media_inputs: { image: { reference: true } } } },
      "qwen_image_edit_plus2_20B",
      "C:\\input\\source.png",
      ["C:\\input\\reference.png"],
    );

    expect(settings).toMatchObject({ image_refs: ["C:\\input\\source.png", "C:\\input\\reference.png"], video_prompt_type: "KI" });
    expect(settings).not.toHaveProperty("image_guide");
  });

  it("retains the legacy image-guide contract when advertised", () => {
    const settings = buildQwenImageEditSettings(
      request,
      { prompt: "", negative_prompt: "", image_mode: 1, image_guide: null, image_refs: [], image_prompt_type: "", video_prompt_type: "", image_refs_relative_size: 50, remove_background_images_ref: 1, num_inference_steps: 20 },
      {},
      "qwen_image_edit_20B",
      "C:\\input\\source.png",
      ["C:\\input\\reference.png"],
    );

    expect(settings).toMatchObject({ image_mode: 1, image_guide: "C:\\input\\source.png", image_refs: ["C:\\input\\reference.png"], image_prompt_type: "", video_prompt_type: "IV" });
  });

  it("supports current text-only edit defaults without image_mode", () => {
    const settings = buildQwenImageEditSettings(
      { ...request, sourceAssetId: undefined, referenceUploadIds: [], guidanceScale: undefined },
      { prompt: "", negative_prompt: "", image_prompt_type: "", video_prompt_type: "", num_inference_steps: 20 },
      { metadata: { media_inputs: { image: { reference: true } } } },
      "qwen_image_edit_plus2_20B",
    );

    expect(settings).toMatchObject({ image_refs: [], image_prompt_type: "", video_prompt_type: "" });
    expect(settings).not.toHaveProperty("image_mode");
  });

  it("builds a face swap when the schema exposes no mask tuning settings", () => {
    const settings = buildQwenImageEditSettings(
      { ...request, faceSwap: true },
      { prompt: "", negative_prompt: "", image_prompt_type: "", video_prompt_type: "", model_mode: 0, num_inference_steps: 20, guidance_scale: 4, guidance_phases: 1, sample_solver: "default", activated_loras: [], loras_multipliers: "" },
      { metadata: { media_inputs: { image: { reference: true } }, capabilities: { lora: true } } },
      "qwen_image_edit_plus2_20B",
      "C:\\input\\source.png",
      ["C:\\input\\reference.png"],
    );

    expect(settings).toMatchObject({ sample_solver: "lightning", guidance_scale: 1, model_mode: 1, activated_loras: FACE_SWAP_LORAS.map((lora) => lora.name) });
    expect(settings).not.toHaveProperty("mask_expand");
    expect(settings).not.toHaveProperty("masking_strength");
  });
});