import type { ModelOption } from "@/lib/types";

/**
 * WanGP activates reference images through `video_prompt_type`, not
 * `image_prompt_type`, even on models that only ever produce stills. The letter
 * and the `image_refs` list are enforced in both directions: references without
 * the letter are ignored, and the letter without references fails the job with
 * "You must provide at least one Reference Image".
 *
 * `"I"`  - every reference is a person or object.
 * `"KI"` - the first reference is the main subject or landscape, and any that
 *          follow are people or objects.
 */
export const REFERENCE_IMAGE_CAPABILITY = "reference-image";
export const REFERENCE_SUBJECTS_ONLY = "I";
export const REFERENCE_LEAD_WITH_SCENE = "KI";

/** The request schema caps a selection at eight; MiniMax H3 Ref2VA allows nine. */
export const MAX_VIDEO_REFERENCE_IMAGES = 8;

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * How many reference images a discovered video checkpoint really takes.
 *
 * `media_inputs.image.reference` is true on MiniMax H3 FL2VA as well, where it
 * covers injected frames rather than references — WanGP only offers a reference
 * selector when `video_prompt_type.image_ref_choices` is published, which FL2VA
 * leaves null and Ref2VA fills in. Trusting the flag alone would put a picker
 * in front of a model that silently discards everything attached to it.
 */
export function discoveredReferenceImageLimit(metadata: Record<string, unknown>) {
  const choices = record(record(record(metadata.setting_values).video_prompt_type).image_ref_choices);
  if (!Array.isArray(choices.choices)) return 0;
  const image = record(record(metadata.media_inputs).image);
  if (image.multiple_references === true) return MAX_VIDEO_REFERENCE_IMAGES;
  return image.reference === true ? 1 : 0;
}

type ReferenceCapableModel = Pick<ModelOption, "capabilities" | "maxReferenceImages" | "sourceUsesReferenceSlot">;

export function supportsReferenceImages(model: ReferenceCapableModel) {
  return Boolean(model.maxReferenceImages) && model.capabilities.includes(REFERENCE_IMAGE_CAPABILITY);
}

export function referenceImageLimit(model: ReferenceCapableModel | undefined, hasSourceImage: boolean) {
  const limit = model?.maxReferenceImages ?? 0;
  return hasSourceImage && model?.sourceUsesReferenceSlot ? Math.max(0, limit - 1) : limit;
}

export function assertReferenceImagesAllowed(model: ModelOption, referenceCount: number, hasSourceImage = false) {
  if (!referenceCount) return;
  if (!supportsReferenceImages(model)) throw new Error(`${model.displayName} does not accept reference images.`);
  const limit = referenceImageLimit(model, hasSourceImage);
  if (referenceCount > limit) throw new Error(`${model.displayName} accepts at most ${limit} reference ${limit === 1 ? "image" : "images"}${hasSourceImage && model.sourceUsesReferenceSlot ? " alongside the image being edited" : ""}.`);
}
