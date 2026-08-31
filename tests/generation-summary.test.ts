import { describe, expect, it } from "vitest";
import { summarizeGenerationSettings } from "@/lib/wan-gp/generation-summary";

describe("summarizeGenerationSettings", () => {
  it("reads model, resolution, steps, and paired LoRA strengths", () => {
    const summary = summarizeGenerationSettings("Krea 2", {
      resolution: "1024x1024",
      num_inference_steps: 28,
      activated_loras: ["portrait/soft-light-portrait.safetensors", "detail.safetensors"],
      loras_multipliers: "0.9 0.5",
    });
    expect(summary).toEqual({
      modelLabel: "Krea 2",
      resolution: "1024x1024",
      steps: 28,
      loras: [{ name: "portrait/soft-light-portrait.safetensors", strength: "0.9" }, { name: "detail.safetensors", strength: "0.5" }],
    });
  });

  it("falls back to alternate keys and defaults a missing multiplier", () => {
    const summary = summarizeGenerationSettings("LTX 2", { size: "1280x720", steps: 8, activated_loras: ["a.safetensors"], loras_multipliers: "" });
    expect(summary.resolution).toBe("1280x720");
    expect(summary.steps).toBe(8);
    expect(summary.loras).toEqual([{ name: "a.safetensors", strength: "1" }]);
  });

  it("omits absent settings", () => {
    expect(summarizeGenerationSettings("Fixture", {})).toEqual({ modelLabel: "Fixture", resolution: undefined, steps: undefined, loras: [] });
  });
});
