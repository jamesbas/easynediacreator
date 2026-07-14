import { describe, expect, it } from "vitest";
import { validateModelLoras } from "@/lib/services/lora-service";

describe("model LoRA validation", () => {
  it("canonicalizes model-aligned LoRA names", () => {
    expect(validateModelLoras([{ name: "STYLE.SAFETENSORS", strength: 0.8 }], { supported: true, loras: ["style.safetensors"] })).toEqual([{ name: "style.safetensors", strength: 0.8 }]);
  });

  it("rejects unlisted and unsupported LoRAs", () => {
    expect(() => validateModelLoras([{ name: "other.safetensors", strength: 1 }], { supported: true, loras: ["style.safetensors"] })).toThrow(/not available/);
    expect(() => validateModelLoras([{ name: "style.safetensors", strength: 1 }], { supported: false, loras: [], reason: "Upgrade WanGP." })).toThrow("Upgrade WanGP.");
  });
});