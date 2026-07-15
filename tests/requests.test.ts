import { describe, expect, it } from "vitest";
import { DEFAULT_NEGATIVE_PROMPT, imageCreateRequestSchema, imageEditRequestSchema, videoCreateRequestSchema } from "@/lib/requests";

describe("generation request validation", () => {
  it("defaults image generation to 20 steps and enforces the supported range", () => {
    const base = { prompt: "test", modelKey: "qwen-image", count: 1 };
    expect(imageCreateRequestSchema.parse(base)).toMatchObject({ steps: 20, negativePrompt: DEFAULT_NEGATIVE_PROMPT });
    expect(imageCreateRequestSchema.parse({ ...base, steps: 1 }).steps).toBe(1);
    expect(imageCreateRequestSchema.parse({ ...base, steps: 200 }).steps).toBe(200);
    expect(() => imageCreateRequestSchema.parse({ ...base, steps: 0 })).toThrow();
    expect(() => imageCreateRequestSchema.parse({ ...base, steps: 201 })).toThrow();
    expect(imageCreateRequestSchema.parse({ ...base, guidanceScale: 4 }).guidanceScale).toBe(4);
    expect(() => imageCreateRequestSchema.parse({ ...base, guidanceScale: 31 })).toThrow();
  });

  it("defaults image editing to 20 steps", () => {
    expect(imageEditRequestSchema.parse({ prompt: "edit", modelKey: "qwen-image-edit", sourceUploadId: crypto.randomUUID() })).toMatchObject({ steps: 20, referenceUploadIds: [], referenceAssetIds: [], faceSwap: false, sharpenUnblur: false });
  });

  it("validates the Sharpen and Unblur exclusivity contract", () => {
    const base = { prompt: "Sharpen the image", modelKey: "qwen-image-edit", sourceUploadId: crypto.randomUUID(), sharpenUnblur: true };
    expect(imageEditRequestSchema.parse(base).sharpenUnblur).toBe(true);
    expect(() => imageEditRequestSchema.parse({ ...base, modelKey: "flux-klein-9b" })).toThrow(/requires Qwen/);
    expect(() => imageEditRequestSchema.parse({ ...base, faceSwap: true, referenceUploadIds: [crypto.randomUUID()] })).toThrow(/either Face Swap or Sharpen/);
    expect(() => imageEditRequestSchema.parse({ ...base, loras: [{ name: "style.safetensors", strength: 1 }] })).toThrow(/cannot be combined with other LoRAs/);
    expect(() => imageEditRequestSchema.parse({ ...base, loraPresetId: "fast" })).toThrow(/cannot be combined with an acceleration preset/);
  });

  it("validates the face-swap image and model contract", () => {
    const base = { prompt: "face swap", modelKey: "qwen-image-edit", sourceUploadId: crypto.randomUUID(), referenceUploadIds: [crypto.randomUUID()], faceSwap: true };
    expect(imageEditRequestSchema.parse(base)).toMatchObject({ faceSwap: true, referenceUploadIds: base.referenceUploadIds });
    expect(() => imageEditRequestSchema.parse({ ...base, modelKey: "flux-klein-9b" })).toThrow(/requires Qwen/);
    expect(() => imageEditRequestSchema.parse({ ...base, referenceUploadIds: [] })).toThrow(/exactly one reference/);
    expect(() => imageEditRequestSchema.parse({ ...base, loras: [{ name: "other.safetensors", strength: 1 }] })).toThrow(/manages its required LoRAs/);
  });

  it("rejects duplicate LoRAs and path-like LoRA names", () => {
    expect(() => imageCreateRequestSchema.parse({ prompt: "test", modelKey: "qwen-image", count: 1, loras: [{ name: "style.safetensors", strength: 1 }, { name: "STYLE.SAFETENSORS", strength: 0.5 }] })).toThrow(/selected more than once/);
    expect(() => imageCreateRequestSchema.parse({ prompt: "test", modelKey: "qwen-image", count: 1, loras: [{ name: "..\\unsafe.safetensors", strength: 1 }] })).toThrow(/available filename/);
  });

  it("accepts 20 seconds but rejects longer video requests", () => {
    const base = { prompt: "test", modelKey: "ltx-2", startUploadId: crypto.randomUUID() };
    expect(videoCreateRequestSchema.parse(base)).toMatchObject({ durationSeconds: 15, sourceStrength: 0.85, negativePrompt: DEFAULT_NEGATIVE_PROMPT });
    expect(videoCreateRequestSchema.parse({ ...base, durationSeconds: 20, sourceStrength: 0 })).toMatchObject({ durationSeconds: 20, sourceStrength: 0 });
    expect(() => videoCreateRequestSchema.parse({ ...base, durationSeconds: 21 })).toThrow();
    expect(() => videoCreateRequestSchema.parse({ ...base, sourceStrength: 1.1 })).toThrow();
  });
});