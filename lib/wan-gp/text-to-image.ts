import type { ModelOption } from "@/lib/types";

/**
 * WanGP reports `text_to_image` on the edit checkpoints as well: Qwen Image Edit
 * and Krea 2 Identity Edit render from the prompt alone when no `image_refs`
 * entry carries a frame to edit.
 */
export const TEXT_TO_IMAGE_CAPABILITY = "text-to-image";

export function supportsTextToImage(model: Pick<ModelOption, "capabilities">) {
  return model.capabilities.includes(TEXT_TO_IMAGE_CAPABILITY);
}
