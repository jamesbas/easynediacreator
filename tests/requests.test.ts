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
  });

  it("defaults image editing to 20 steps", () => {
    expect(imageEditRequestSchema.parse({ prompt: "edit", modelKey: "qwen-image-edit", sourceUploadId: crypto.randomUUID() })).toMatchObject({ steps: 20, referenceUploadIds: [], referenceAssetIds: [], faceSwap: false });
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
    expect(videoCreateRequestSchema.parse({ ...base, durationSeconds: 20 })).toMatchObject({ durationSeconds: 20, steps: 20, negativePrompt: DEFAULT_NEGATIVE_PROMPT });
    expect(() => videoCreateRequestSchema.parse({ ...base, durationSeconds: 21 })).toThrow();
  });
});