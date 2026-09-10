import sharp from "sharp";
import { resolveCharacterReferencePaths } from "@/lib/characters/storage";
import { getOutput } from "@/lib/runtime/output-registry";
import { logger } from "@/lib/telemetry";
import { getUpload } from "@/lib/uploads/storage";

/**
 * The pictures a rewrite is allowed to look at.
 *
 * Every one is named by an id the app already issued — an upload, an output, or
 * a saved character reference — and resolved through the same registries the
 * generation services use. Nothing accepts a path, so a request cannot ask the
 * enhancer to read an arbitrary file.
 */
export type EnhancerImageSelection = {
  startUploadId?: string;
  startAssetId?: string;
  endUploadId?: string;
  endAssetId?: string;
  sourceUploadId?: string;
  sourceAssetId?: string;
  referenceUploadIds?: string[];
  referenceAssetIds?: string[];
  characterReferenceIds?: string[];
};

export type EnhancerImage = { label: string; dataUrl: string };

/** A vision model gains nothing from more, and every one costs context and time. */
export const MAX_ENHANCER_IMAGES = 4;
/** Enough for setting, wardrobe and faces; far below what a full frame would cost. */
const MAX_EDGE_PIXELS = 768;

function uploadPath(id?: string) {
  return id ? getUpload(id)?.path : undefined;
}

function assetPath(id?: string) {
  if (!id) return undefined;
  const asset = getOutput(id);
  return asset?.type === "image" ? asset.path : undefined;
}

/**
 * The images in the order the render model receives them.
 *
 * MiniMax H3 numbers its pictures start, then end, then the general references,
 * so the labels here only line up with the `<Picture N>` roles in the writing
 * directive if this order is kept.
 */
export async function resolveEnhancerImages(selection: EnhancerImageSelection) {
  const characters = await resolveCharacterReferencePaths(selection.characterReferenceIds ?? []).catch(() => []);
  const references = [
    ...characters,
    ...(selection.referenceUploadIds ?? []).map(uploadPath),
    ...(selection.referenceAssetIds ?? []).map(assetPath),
  ].filter((path): path is string => Boolean(path));

  const start = uploadPath(selection.startUploadId) ?? assetPath(selection.startAssetId);
  const end = uploadPath(selection.endUploadId) ?? assetPath(selection.endAssetId);
  const source = uploadPath(selection.sourceUploadId) ?? assetPath(selection.sourceAssetId);

  const roles: { path: string; describe: (position: number) => string }[] = [];
  if (start) roles.push({ path: start, describe: (position) => `Image ${position} is the start frame. The clip opens on exactly this, so it fixes the opening composition, subjects, wardrobe and light.` });
  if (end) roles.push({ path: end, describe: (position) => `Image ${position} is the end frame. The clip must arrive at exactly this.` });
  if (source) roles.push({ path: source, describe: (position) => `Image ${position} is the picture being edited. Write only the change, and name what must stay as it is.` });
  for (const path of references) roles.push({ path, describe: (position) => `Image ${position} is a reference: a person or object to carry into the result, not a frame of it.` });

  const selected = roles.slice(0, MAX_ENHANCER_IMAGES);
  const encoded = await Promise.all(selected.map(async (role, index) => {
    const dataUrl = await encodeForVision(role.path);
    return dataUrl ? { label: role.describe(index + 1), dataUrl } : undefined;
  }));
  return encoded.filter((image): image is EnhancerImage => Boolean(image));
}

/**
 * A picture the language model can read, or nothing.
 *
 * A file that has gone missing is not a reason to refuse the rewrite; it only
 * costs the detail that picture would have added.
 */
async function encodeForVision(path: string) {
  try {
    const buffer = await sharp(path)
      .rotate()
      .resize({ width: MAX_EDGE_PIXELS, height: MAX_EDGE_PIXELS, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (error) {
    logger.warn({ event: "prompt_enhancer.image_unreadable", message: error instanceof Error ? error.message : String(error) }, "Skipped an image the rewrite could not read");
    return undefined;
  }
}
