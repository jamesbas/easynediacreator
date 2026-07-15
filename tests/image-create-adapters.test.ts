import { describe, expect, it } from "vitest";
import { buildFluxKleinImageSettings } from "@/lib/wan-gp/adapters/flux-klein-image";

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
});