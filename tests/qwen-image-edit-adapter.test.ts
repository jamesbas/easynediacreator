import { describe, expect, it } from "vitest";
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
});