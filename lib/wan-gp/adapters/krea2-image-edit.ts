import type { ImageEditRequest } from "@/lib/requests";
import { REFERENCE_LEAD_WITH_SCENE, REFERENCE_SUBJECTS_ONLY } from "../reference-images";
import { applyLoraSettings, applySamplingSettings, hasDiscoveredSetting, setDiscoveredSetting } from "../settings-builder";
import { krea2GuidanceScale } from "./krea2-image";

/**
 * Krea 2 Identity Edit takes the image being edited and any extra references in
 * one `image_refs` list rather than through a separate guide input: WanGP's
 * krea2 handler hides `guide_custom_choices_image` and defaults the reference
 * group to "KI", meaning the first entry is the main subject or landscape and
 * anything after it is a person or object.
 */
export function buildKrea2ImageEditSettings(request: ImageEditRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string, sourcePath?: string, referencePaths: string[] = []) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  const imageRefs = sourcePath ? [sourcePath, ...referencePaths] : referencePaths;
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt", "instruction"], request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], imageRefs, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], sourcePath ? REFERENCE_LEAD_WITH_SCENE : imageRefs.length ? REFERENCE_SUBJECTS_ONLY : "", true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], "");
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_guide"], null);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mask"], null);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt_enhancer"], "");
  // Only strip backgrounds once a person or object reference follows the source;
  // with a single entry the whole frame is the subject and there is nothing to cut.
  if (referencePaths.length) setDiscoveredSetting(settings, schema, defaults, modelType, ["remove_background_images_ref"], 1);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["num_inference_steps", "steps"], request.steps, true);
  if (hasDiscoveredSetting(schema, defaults, ["guidance_scale", "cfg_scale"])) {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_scale", "cfg_scale"], krea2GuidanceScale(request.guidanceScale, modelType), request.guidanceScale !== undefined);
  }
  applySamplingSettings(settings, schema, defaults, modelType, request);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  return settings;
}
