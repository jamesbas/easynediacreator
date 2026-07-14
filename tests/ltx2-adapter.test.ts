import { describe, expect, it } from "vitest";
import { buildLtx2VideoSettings } from "@/lib/wan-gp/adapters/ltx2-video";

describe("LTX-2 settings", () => {
  it("maps optional end frames only inside the adapter", () => {
    const settings = buildLtx2VideoSettings({ prompt: "Slow camera push", negativePrompt: "blurry", modelKey: "ltx-2", startAssetId: crypto.randomUUID(), endAssetId: crypto.randomUUID(), durationSeconds: 5, steps: 20, loras: [], advanced: {} }, { fps: 24 }, {}, "ltx2_fixture", "C:\\input\\start.png", "C:\\input\\end.png");
    expect(settings).toMatchObject({ image_start: "C:\\input\\start.png", image_end: "C:\\input\\end.png", duration_seconds: 5, fps: 24 });
  });

  it("maps a 20 second LTX-2 clip to the nearest valid 8k+1 frame count", () => {
    const settings = buildLtx2VideoSettings({ prompt: "Long shot", negativePrompt: "blurry", modelKey: "ltx-2", startAssetId: crypto.randomUUID(), durationSeconds: 20, fps: 24, steps: 20, loras: [], advanced: {} }, { prompt: "", negative_prompt: "", image_prompt_type: "", image_start: null, fps: 24, video_length: 121, num_inference_steps: 8 }, {}, "ltx2_22B", "C:\\input\\start.png");
    expect(settings.video_length).toBe(481);
    expect(settings).not.toHaveProperty("duration_seconds");
  });

  it("passes multiple selected LoRAs with aligned strengths", () => {
    const settings = buildLtx2VideoSettings({ prompt: "Styled shot", negativePrompt: "blurry", modelKey: "ltx-2", startAssetId: crypto.randomUUID(), steps: 20, loras: [{ name: "cinematic.safetensors", strength: 0.7 }, { name: "motion.sft", strength: 1.2 }], advanced: {} }, { prompt: "", negative_prompt: "", image_prompt_type: "", image_start: null, num_inference_steps: 8, activated_loras: [], loras_multipliers: "" }, {}, "ltx2_22B", "C:\\input\\start.png");
    expect(settings).toMatchObject({ activated_loras: ["cinematic.safetensors", "motion.sft"], loras_multipliers: "0.7 1.2" });
  });

  it("uses compact WanGP metadata when attachment fields are absent from defaults", () => {
    const settings = buildLtx2VideoSettings(
      { prompt: "Camera push", negativePrompt: "blurry", modelKey: "ltx-2", startAssetId: crypto.randomUUID(), endAssetId: crypto.randomUUID(), steps: 20, loras: [], advanced: {} },
      { prompt: "", negative_prompt: "", image_prompt_type: "", num_inference_steps: 8, activated_loras: [], loras_multipliers: "" },
      { metadata: { media_inputs: { image: { start: true, end: true } }, setting_values: { image_prompt_type: { allowed: "TSEVL" } } } },
      "ltx2_22B_distilled", "C:\\input\\start.png", "C:\\input\\end.png",
    );
    expect(settings).toMatchObject({ image_prompt_type: "SE", image_start: "C:\\input\\start.png", image_end: "C:\\input\\end.png" });
  });
});