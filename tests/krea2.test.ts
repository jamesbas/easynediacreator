import { beforeEach, describe, expect, it } from "vitest";
import { clearModelCache, getModels } from "@/lib/runtime/model-cache";
import { resetJobsForTests } from "@/lib/runtime/job-registry";
import { resetOutputsForTests } from "@/lib/runtime/output-registry";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { createImage } from "@/lib/services/image-create-service";
import { editImage } from "@/lib/services/image-edit-service";
import { buildKrea2ImageSettings } from "@/lib/wan-gp/adapters/krea2-image";
import { buildKrea2ImageEditSettings } from "@/lib/wan-gp/adapters/krea2-image-edit";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { getLoraDirectoryName } from "@/lib/wan-gp/local-lora-catalog";
import { setWanGpClientForTests } from "@/lib/wan-gp";
import sharp from "sharp";

/**
 * Krea 2.
 *
 * WanGP ships four checkpoints under the `krea2` family. Only the two Identity
 * Edit variants publish `image_ref_choices`, so the RAW and Turbo checkpoints
 * must refuse references outright rather than render without them and leave
 * nothing to debug. Turbo is step-distilled with `guidance_max_phases: 0`, which
 * makes any CFG above zero a silent no-op.
 */

async function uploadFixture() {
  const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#123456" } }).png().toBuffer();
  return storeImageUpload(buffer, { mime: "image/png", extension: "png", width: 64, height: 64 });
}

describe("Krea 2", () => {
  beforeEach(() => { resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); clearModelCache(); setWanGpClientForTests(new FakeWanGpClient()); });

  it("prefers the Turbo variant and exposes both checkpoints for pinning", async () => {
    const models = await getModels();
    const create = models.find((model) => model.workflowType === "image-create" && model.key === "krea-2");
    expect(create?.modelType).toBe("krea2_turbo_fixture");
    expect(create?.candidates.map((candidate) => candidate.modelType)).toEqual(["krea2_raw_fixture", "krea2_turbo_fixture"]);
    expect(create?.maxReferenceImages).toBeUndefined();

    const edit = models.find((model) => model.workflowType === "image-edit" && model.key === "krea-2-edit");
    expect(edit?.modelType).toBe("krea2_turbo_edit_fixture");
    expect(edit?.maxReferenceImages).toBe(3);
    expect(edit?.sourceUsesReferenceSlot).toBe(true);
  });

  it("maps the krea2 family to its own LoRA folder", () => {
    expect(getLoraDirectoryName({ metadata: { family: "krea2" } })).toBe("krea2");
  });

  it("clears every conditioning pathway when rendering from text alone", () => {
    const settings = buildKrea2ImageSettings(
      { prompt: "A fox in fresh snow", negativePrompt: "blurry", modelKey: "krea-2", count: 1, steps: 8, guidanceScale: 4, loras: [], advanced: {} },
      { prompt: "", negative_prompt: "", video_prompt_type: "KI", image_refs: ["C:\\stale\\reference.png"], image_guide: "C:\\stale\\control.png", num_inference_steps: 52, guidance_scale: 3.5, activated_loras: ["stale.safetensors"], loras_multipliers: "1" },
      {},
      "krea2_turbo",
    );

    // Turbo is distilled: the requested guidance of 4 is discarded rather than sent.
    expect(settings).toMatchObject({ prompt: "A fox in fresh snow", video_prompt_type: "", image_refs: [], image_guide: null, num_inference_steps: 8, guidance_scale: 0, activated_loras: [], loras_multipliers: "" });
  });

  it("accepts LoRAs when the model declares support but its saved defaults omit activated_loras", () => {
    const settings = buildKrea2ImageSettings(
      { prompt: "A fox in fresh snow", negativePrompt: "", modelKey: "krea-2", count: 1, steps: 8, loras: [{ name: "snofs_krea_v1.safetensors", strength: 1 }], advanced: {} },
      { prompt: "", negative_prompt: "", num_inference_steps: 8, guidance_scale: 0 },
      { metadata: { capabilities: { lora: true } } },
      "krea2_turbo",
    );

    expect(settings).toMatchObject({ activated_loras: ["snofs_krea_v1.safetensors"], loras_multipliers: "1" });
  });

  it("sends the source first and keeps the requested guidance on the RAW edit checkpoint", () => {
    const settings = buildKrea2ImageEditSettings(
      { prompt: "Make the coat red", negativePrompt: "blurry", modelKey: "krea-2-edit", steps: 20, guidanceScale: 2, faceSwap: false, sharpenUnblur: false, loras: [], advanced: {} },
      { prompt: "", negative_prompt: "", video_prompt_type: "", image_refs: [], remove_background_images_ref: 0, num_inference_steps: 20, guidance_scale: 2, activated_loras: [], loras_multipliers: "" },
      {},
      "krea2_raw_edit",
      "C:\\media\\source.png",
      ["C:\\media\\face.png"],
    );

    // "KI" declares the leading entry as the subject being edited; without it
    // WanGP ignores image_refs entirely.
    expect(settings).toMatchObject({ video_prompt_type: "KI", image_refs: ["C:\\media\\source.png", "C:\\media\\face.png"], remove_background_images_ref: 1, guidance_scale: 2 });
  });

  it("leaves background removal alone when the source is the only reference", () => {
    const settings = buildKrea2ImageEditSettings(
      { prompt: "Make the coat red", negativePrompt: "", modelKey: "krea-2-edit", steps: 8, faceSwap: false, sharpenUnblur: false, loras: [], advanced: {} },
      { prompt: "", negative_prompt: "", video_prompt_type: "", image_refs: [], remove_background_images_ref: 0, num_inference_steps: 8 },
      {},
      "krea2_turbo_edit",
      "C:\\media\\source.png",
    );

    expect(settings).toMatchObject({ image_refs: ["C:\\media\\source.png"], remove_background_images_ref: 0 });
  });

  it("omits CFG when the Turbo Edit contract disables guidance phases", () => {
    const settings = buildKrea2ImageEditSettings(
      { prompt: "Make the coat red", negativePrompt: "", modelKey: "krea-2-edit", steps: 8, guidanceScale: 0, faceSwap: false, sharpenUnblur: false, loras: [], advanced: {} },
      { prompt: "", negative_prompt: "", image_prompt_type: "", video_prompt_type: "", num_inference_steps: 8, activated_loras: [], loras_multipliers: "" },
      { metadata: { media_inputs: { image: { reference: true } }, capabilities: { lora: true } }, model_def: { guidance_max_phases: 0 } },
      "krea2_turbo_edit",
      "C:\\media\\source.png",
    );

    expect(settings).toMatchObject({ image_refs: ["C:\\media\\source.png"], video_prompt_type: "KI", num_inference_steps: 8 });
    expect(settings).not.toHaveProperty("guidance_scale");
    expect(settings).not.toHaveProperty("cfg_scale");
  });

  it("refuses reference images on the text-to-image checkpoints", async () => {
    const upload = await uploadFixture();
    await expect(createImage({ prompt: "A fox", negativePrompt: "", modelKey: "krea-2", count: 1, steps: 8, loras: [], advanced: {}, referenceUploadIds: [upload.id] }))
      .rejects.toThrow(/does not accept reference images/);
  });

  it("refuses more references than the Identity Edit checkpoint conditions on", async () => {
    const [source, ...references] = await Promise.all([uploadFixture(), uploadFixture(), uploadFixture(), uploadFixture()]);
    await expect(editImage({ prompt: "Recolour", negativePrompt: "", modelKey: "krea-2-edit", steps: 8, loras: [], advanced: {}, sourceUploadId: source.id, faceSwap: false, sharpenUnblur: false, referenceUploadIds: references.map((reference) => reference.id) }))
      .rejects.toThrow(/at most 2 reference images alongside the image being edited\./);
  });

  it("keeps two reference slots alongside the image being edited", async () => {
    const [source, ...references] = await Promise.all([uploadFixture(), uploadFixture(), uploadFixture()]);
    await expect(editImage({ prompt: "Recolour", negativePrompt: "", modelKey: "krea-2-edit", steps: 8, loras: [], advanced: {}, sourceUploadId: source.id, faceSwap: false, sharpenUnblur: false, referenceUploadIds: references.map((reference) => reference.id) }))
      .resolves.toMatchObject({ workflowType: "image-edit" });
  });

  it("frees the last reference slot when no image is being edited", async () => {
    const references = await Promise.all([uploadFixture(), uploadFixture(), uploadFixture()]);
    await expect(editImage({ prompt: "Put them on a beach", negativePrompt: "", modelKey: "krea-2-edit", steps: 8, loras: [], advanced: {}, faceSwap: false, sharpenUnblur: false, referenceUploadIds: references.map((reference) => reference.id) }))
      .resolves.toMatchObject({ workflowType: "image-edit" });
  });
});
