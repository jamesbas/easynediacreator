import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveEnhancerImages, MAX_ENHANCER_IMAGES } from "@/lib/prompt-enhancer/images";
import { addCharacterReference, createCharacter, listCharacters, removeCharacter } from "@/lib/characters/storage";
import { resetOutputsForTests } from "@/lib/runtime/output-registry";
import { resetUploadsForTests, storeImageUpload } from "@/lib/uploads/storage";

async function upload(colour: string) {
  const buffer = await sharp({ create: { width: 64, height: 48, channels: 3, background: colour } }).png().toBuffer();
  return storeImageUpload(buffer, { mime: "image/png", extension: "png", width: 64, height: 48 });
}

/**
 * The pictures the rewrite is allowed to see.
 *
 * Two properties matter: the model must be told which image is which, and a
 * request must never be able to name a file the app did not issue a handle for.
 */
describe("images sent with a prompt rewrite", () => {
  beforeEach(async () => {
    resetUploadsForTests(); resetOutputsForTests();
    for (const character of await listCharacters()) await removeCharacter(character.id);
  });

  it("labels each picture with the role the render will give it", async () => {
    const start = await upload("#204060");
    const end = await upload("#603020");
    const reference = await upload("#206040");

    const images = await resolveEnhancerImages({ startUploadId: start.id, endUploadId: end.id, referenceUploadIds: [reference.id] });

    expect(images).toHaveLength(3);
    expect(images[0].label).toContain("Image 1 is the start frame");
    expect(images[1].label).toContain("Image 2 is the end frame");
    expect(images[2].label).toContain("Image 3 is a reference");
    for (const image of images) expect(image.dataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("orders references the way the render model numbers them, characters first", async () => {
    const character = await createCharacter({ name: "Keeper" });
    const saved = await addCharacterReference(character.id, await sharp({ create: { width: 32, height: 32, channels: 3, background: "#123456" } }).png().toBuffer());
    const ad_hoc = await upload("#654321");

    const images = await resolveEnhancerImages({ characterReferenceIds: [saved.id], referenceUploadIds: [ad_hoc.id] });

    expect(images.map((image) => image.label)).toEqual([
      expect.stringContaining("Image 1 is a reference"),
      expect.stringContaining("Image 2 is a reference"),
    ]);
  });

  it("ignores a handle the app never issued rather than reading anything else", async () => {
    const images = await resolveEnhancerImages({ sourceUploadId: crypto.randomUUID(), referenceAssetIds: [crypto.randomUUID()] });
    expect(images).toEqual([]);
  });

  it("stops at the number a vision model can usefully hold", async () => {
    const uploads = await Promise.all(["#111111", "#222222", "#333333", "#444444", "#555555", "#666666"].map(upload));
    const images = await resolveEnhancerImages({ referenceUploadIds: uploads.map((item) => item.id) });
    expect(images).toHaveLength(MAX_ENHANCER_IMAGES);
  });

  it("shrinks a picture so a rewrite does not cost a full frame of context", async () => {
    const large = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#808080" } }).png().toBuffer();
    const stored = await storeImageUpload(large, { mime: "image/png", extension: "png", width: 3000, height: 2000 });

    const [image] = await resolveEnhancerImages({ sourceUploadId: stored.id });

    const decoded = Buffer.from(image.dataUrl.split(",")[1], "base64");
    const { width, height } = await sharp(decoded).metadata();
    expect(Math.max(width ?? 0, height ?? 0)).toBeLessThanOrEqual(768);
    expect(decoded.byteLength).toBeLessThan(large.byteLength);
  });
});
