import { describe, expect, it } from "vitest";
import { applyLoraAccelerationPreset, resolveLoraPreset, validateModelLoras } from "@/lib/services/lora-service";
import type { LoraCatalog } from "@/lib/types";

describe("model LoRA validation", () => {
  it("canonicalizes model-aligned LoRA names", () => {
    expect(validateModelLoras([{ name: "STYLE.SAFETENSORS", strength: 0.8 }], { supported: true, loras: ["style.safetensors"] })).toEqual([{ name: "style.safetensors", strength: 0.8 }]);
  });

  it("rejects unlisted and unsupported LoRAs", () => {
    expect(() => validateModelLoras([{ name: "other.safetensors", strength: 1 }], { supported: true, loras: ["style.safetensors"] })).toThrow(/not available/);
    expect(() => validateModelLoras([{ name: "style.safetensors", strength: 1 }], { supported: false, loras: [], reason: "Upgrade WanGP." })).toThrow("Upgrade WanGP.");
  });

  it("resolves and applies a complete acceleration preset", () => {
    const preset = { id: "qwen-lightning", label: "Lightning 4", modelTypes: ["qwen_image_20B"], workflowTypes: ["image-create" as const], loras: [{ filename: "lightning.safetensors", multiplier: 1, required: true, role: "single" as const }], settings: { numInferenceSteps: 4, guidanceScale: 1, sampleSolver: "lightning", additional: { flow_shift: 3 } }, source: "wan-gp-profile" as const, confidence: "high" as const, evidence: [{ source: "wan-gp-profile" as const, detail: "fixture" }] };
    const catalog: LoraCatalog = { supported: true, loras: ["lightning.safetensors", "character.safetensors"], accelerationPresets: [preset] };
    const characterLora = [{ name: "character.safetensors", strength: 0.7 }];
    const resolved = resolveLoraPreset("qwen-lightning", characterLora, catalog, "qwen_image_20B", "image-create");
    expect(applyLoraAccelerationPreset({}, resolved, characterLora)).toEqual({ activated_loras: ["lightning.safetensors", "character.safetensors"], loras_multipliers: "1 0.7", num_inference_steps: 4, guidance_scale: 1, sample_solver: "lightning", flow_shift: 3 });
    expect(() => resolveLoraPreset("qwen-lightning", [{ name: "lightning.safetensors", strength: 1 }], catalog, "qwen_image_20B", "image-create")).toThrow(/belongs to an acceleration preset/);
    expect(() => resolveLoraPreset("stale", [], catalog, "qwen_image_20B", "image-create")).toThrow(/stale/);
  });

  it("appends manual strengths after raw multiphase preset multipliers", () => {
    const preset = { id: "paired", label: "Paired", modelTypes: ["wan"], workflowTypes: ["video-create" as const], loras: [{ filename: "high.safetensors", multiplier: "profile-controlled", required: true }, { filename: "low.safetensors", multiplier: "profile-controlled", required: true }], settings: { additional: { loras_multipliers: "1;0 0;1" } }, source: "wan-gp-profile" as const, confidence: "high" as const, evidence: [] };
    expect(applyLoraAccelerationPreset({}, preset, [{ name: "motion.safetensors", strength: 0.8 }])).toMatchObject({ activated_loras: ["high.safetensors", "low.safetensors", "motion.safetensors"], loras_multipliers: "1;0 0;1 0.8" });
  });
});