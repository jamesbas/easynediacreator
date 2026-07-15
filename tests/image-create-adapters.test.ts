import { describe, expect, it } from "vitest";
import { buildFluxKleinImageSettings } from "@/lib/wan-gp/adapters/flux-klein-image";
import { buildQwenImageSettings } from "@/lib/wan-gp/adapters/qwen-image";

describe("image-create adapters", () => {
  it("clears inherited Flux control-image mode for text-to-image generation", () => {
    const settings = buildFluxKleinImageSettings(
      { prompt: "Sunset at the beach", negativePrompt: "blurry", modelKey: "flux-klein-9b", count: 1, steps: 4, loras: [], advanced: {} },
      { image_mode: 1, image_prompt_type: "", video_prompt_type: "MV", image_guide: "C:\\stale\\control.png", image_refs: ["C:\\stale\\reference.png"], image_mask: "C:\\stale\\mask.png", prompt: "", negative_prompt: "", resolution: "1088x1920", num_inference_steps: 8, prompt_enhancer: "T", override_profile: -1, activated_loras: ["stale.safetensors"], loras_multipliers: "1" },
      {},
      "flux2_klein_9b",
    );

    expect(settings).toMatchObject({ image_mode: 1, image_prompt_type: "", video_prompt_type: "", image_guide: null, image_refs: [], image_mask: null, prompt: "Sunset at the beach", resolution: "1024x1024", num_inference_steps: 4, prompt_enhancer: "", override_profile: 4.5, activated_loras: [], loras_multipliers: "" });
  });

  it("submits explicit Qwen Guidance and forces 1 for Lightning LoRAs", () => {
    const defaults = { image_mode: 1, image_prompt_type: "", video_prompt_type: "", prompt: "", negative_prompt: "", guidance_scale: 9, num_inference_steps: 30, activated_loras: [], loras_multipliers: "" };
    const standard = buildQwenImageSettings(
      { prompt: "Portrait", negativePrompt: "blurry", modelKey: "qwen-image", count: 1, steps: 30, guidanceScale: 4, loras: [], advanced: {} },
      defaults, {}, "qwen_image_2512_20B",
    );
    const lightning = buildQwenImageSettings(
      { prompt: "Portrait", negativePrompt: "blurry", modelKey: "qwen-image", count: 1, steps: 4, guidanceScale: 7, loras: [{ name: "Qwen-Lightning-4steps.safetensors", strength: 1 }], advanced: {} },
      defaults, {}, "qwen_image_2512_20B",
    );

    expect(standard.guidance_scale).toBe(4);
    expect(lightning).toMatchObject({ guidance_scale: 1, activated_loras: ["Qwen-Lightning-4steps.safetensors"] });
  });
});