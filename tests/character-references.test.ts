import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { addCharacterReference, characterReferenceRoot, createCharacter, listCharacters, removeCharacter, removeCharacterReference, updateCharacter } from "@/lib/characters/storage";
import { getAppPreferences } from "@/lib/runtime/app-preferences";
import { clearModelCache } from "@/lib/runtime/model-cache";
import { resetJobsForTests } from "@/lib/runtime/job-registry";
import { resetOutputsForTests } from "@/lib/runtime/output-registry";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";
import { createImage } from "@/lib/services/image-create-service";
import { FakeWanGpClient } from "@/lib/wan-gp/fake-client";
import { setWanGpClientForTests } from "@/lib/wan-gp";

/**
 * The named character library and its reference images.
 *
 * These outlive a session, so unlike generation uploads they are indexed in
 * `app-preferences.json`. Three properties matter: saving one character must not
 * disturb another, the stored filename must come from the decoder rather than
 * from anything a client sent, and deleting a character must take its files with it.
 */

async function png(colour: string) {
  return sharp({ create: { width: 48, height: 48, channels: 3, background: colour } }).png().toBuffer();
}

describe("character library", () => {
  beforeEach(async () => {
    resetJobsForTests(); resetOutputsForTests(); resetUploadsForTests(); clearModelCache();
    setWanGpClientForTests(new FakeWanGpClient());
    for (const character of await listCharacters()) await removeCharacter(character.id);
  });

  it("names files from the decoded type and keeps them inside the library folder", async () => {
    const character = await createCharacter({ name: "Keeper" });
    const reference = await addCharacterReference(character.id, await png("#aa3311"));
    expect(reference.extension).toBe("png");
    const stored = path.join(characterReferenceRoot, `${reference.id}.png`);
    await expect(fs.stat(stored)).resolves.toBeDefined();
    await removeCharacterReference(reference.id);
    await expect(fs.stat(stored)).rejects.toThrow();
  });

  it("refuses a third reference and leaves the other characters untouched", async () => {
    const keeper = await createCharacter({ name: "Keeper", prompt: "A weathered lighthouse keeper." });
    const sailor = await createCharacter({ name: "Sailor" });
    await addCharacterReference(keeper.id, await png("#112233"));
    await addCharacterReference(keeper.id, await png("#334455"));
    await expect(addCharacterReference(keeper.id, await png("#556677"))).rejects.toThrow(/at most 2/);
    await updateCharacter(sailor.id, { prompt: "A young deckhand." });
    const preferences = await getAppPreferences();
    expect(preferences.characters.find((candidate) => candidate.id === keeper.id)?.references).toHaveLength(2);
    expect(preferences.characters.find((candidate) => candidate.id === keeper.id)?.prompt).toBe("A weathered lighthouse keeper.");
    expect(preferences.characters.find((candidate) => candidate.id === sailor.id)?.prompt).toBe("A young deckhand.");
  });

  it("deletes a character together with its reference files", async () => {
    const character = await createCharacter({ name: "Keeper" });
    const reference = await addCharacterReference(character.id, await png("#334422"));
    const stored = path.join(characterReferenceRoot, `${reference.id}.png`);
    await removeCharacter(character.id);
    expect(await listCharacters()).toHaveLength(0);
    await expect(fs.stat(stored)).rejects.toThrow();
  });

  it("conditions a generation on references from more than one character, ahead of ad-hoc uploads", async () => {
    const client = new FakeWanGpClient();
    setWanGpClientForTests(client);
    const keeper = await createCharacter({ name: "Keeper" });
    const sailor = await createCharacter({ name: "Sailor" });
    const keeperReference = await addCharacterReference(keeper.id, await png("#204060"));
    const sailorReference = await addCharacterReference(sailor.id, await png("#402060"));
    const upload = await storeImageUpload(await png("#605020"), { mime: "image/png", extension: "png", width: 48, height: 48 });

    await createImage({ prompt: "The keeper on the gallery deck", negativePrompt: "blurry", modelKey: "qwen-image", count: 1, steps: 20, loras: [], advanced: {}, characterReferenceIds: [keeperReference.id, sailorReference.id], referenceUploadIds: [upload.id] });

    const settings = client.getLastSubmissionForTests()?.settings as Record<string, unknown>;
    // "I" is what activates image_refs on a model with no source frame; without
    // it WanGP renders happily and ignores every reference.
    expect(settings.video_prompt_type).toBe("I");
    expect(settings.remove_background_images_ref).toBe(1);
    expect(settings.image_refs).toEqual([path.join(characterReferenceRoot, `${keeperReference.id}.png`), path.join(characterReferenceRoot, `${sailorReference.id}.png`), upload.path]);
  });
});
