import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { addCharacterReference, characterReferenceRoot, listCharacterReferences, removeCharacterReference } from "@/lib/character-references/storage";
import { getAppPreferences, setAppPreferences } from "@/lib/runtime/app-preferences";
import { clearModelCache } from "@/lib/runtime/model-cache";
import { resetJobsForTests } from "@/lib/runtime/job-registry";
import { resetOutputsForTests } from "@/lib/runtime/output-registry";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { createImage } from "@/lib/services/image-create-service";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";

/**
 * Character reference images.
 *
 * These outlive a session, so unlike generation uploads they are indexed in
 * `app-preferences.json`. Two properties matter: saving one field of the
 * preferences must not blank out the other, and the stored filename must come
 * from the decoder rather than from anything a client sent.
 */

async function png(colour: string) {
  return sharp({ create: { width: 48, height: 48, channels: 3, background: colour } }).png().toBuffer();
}

describe("character reference images", () => {
  beforeEach(async () => {
    resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); clearModelCache();
    setWanGpClientForTests(new FakeWanGpClient());
    for (const reference of await listCharacterReferences()) await removeCharacterReference(reference.id);
  });

  it("names files from the decoded type and keeps them inside the library folder", async () => {
    const reference = await addCharacterReference(await png("#aa3311"));
    expect(reference.extension).toBe("png");
    const stored = path.join(characterReferenceRoot, `${reference.id}.png`);
    await expect(fs.stat(stored)).resolves.toBeDefined();
    await removeCharacterReference(reference.id);
    await expect(fs.stat(stored)).rejects.toThrow();
  });

  it("refuses a third reference and leaves the saved character prompt untouched", async () => {
    await setAppPreferences({ characterPrompt: "A weathered lighthouse keeper." });
    await addCharacterReference(await png("#112233"));
    await addCharacterReference(await png("#334455"));
    await expect(addCharacterReference(await png("#556677"))).rejects.toThrow(/at most 2/);
    const preferences = await getAppPreferences();
    expect(preferences.characterReferences).toHaveLength(2);
    expect(preferences.characterPrompt).toBe("A weathered lighthouse keeper.");
  });

  it("conditions a generation on the saved references, ahead of ad-hoc uploads", async () => {
    const client = new FakeWanGpClient();
    setWanGpClientForTests(client);
    const character = await addCharacterReference(await png("#204060"));
    const upload = await storeImageUpload(await png("#605020"), { mime: "image/png", extension: "png", width: 48, height: 48 });

    await createImage({ prompt: "The keeper on the gallery deck", negativePrompt: "blurry", modelKey: "qwen-image", count: 1, steps: 20, loras: [], advanced: {}, characterReferenceIds: [character.id], referenceUploadIds: [upload.id] });

    const settings = client.getLastSubmissionForTests()?.settings as Record<string, unknown>;
    // "I" is what activates image_refs on a model with no source frame; without
    // it WanGP renders happily and ignores every reference.
    expect(settings.video_prompt_type).toBe("I");
    expect(settings.remove_background_images_ref).toBe(1);
    expect(settings.image_refs).toEqual([path.join(characterReferenceRoot, `${character.id}.png`), upload.path]);
  });
});
