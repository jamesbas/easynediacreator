import { resolveCharacterReferencePaths } from "@/lib/character-references/storage";
import type { ReferenceSelection } from "@/lib/requests";
import { getOutput } from "@/lib/runtime/output-registry";
import { getUpload } from "@/lib/uploads/storage";

/**
 * Absolute paths for every reference attached to a request, readable by the
 * WanGP process. Saved character references lead, because WanGP weights the
 * earlier entries of `image_refs` more heavily and identity is what they exist
 * to hold steady.
 */
export async function resolveReferenceImagePaths(selection: ReferenceSelection) {
  const characters = await resolveCharacterReferencePaths(selection.characterReferenceIds ?? []);
  const uploads = (selection.referenceUploadIds ?? []).map((id) => getUpload(id)?.path);
  const assets = (selection.referenceAssetIds ?? []).map((id) => {
    const asset = getOutput(id);
    if (asset && asset.type !== "image") throw new Error("Choose only image outputs as references.");
    return asset?.path;
  });
  const references = [...characters, ...uploads, ...assets];
  if (references.some((reference) => !reference)) throw new Error("A reference image could not be found.");
  return references as string[];
}
