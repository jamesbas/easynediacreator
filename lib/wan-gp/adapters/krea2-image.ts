import type { ImageCreateRequest } from "@/lib/requests";
import { hasKrea2DistilledMarker } from "../image-guidance";
import { applyLoraSettings, applySamplingSettings, hasDiscoveredSetting, setDiscoveredSetting } from "../settings-builder";

/**
 * Krea 2 RAW and Turbo render from text alone. Unlike Qwen and Flux they are
 * built here rather than through `commonImageSettings`, because WanGP's krea2
 * handler publishes no `image_ref_choices` and only a subset of the shared
 * conditioning fields: treating those as mandatory would fail the job outright.
 */
export function buildKrea2ImageSettings(request: ImageCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt"], request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt);
  // Clear every conditioning pathway the schema exposes: a stale WanGP default
  // left in place would make the server demand a guide or reference image that
  // this workflow never sends.
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], "");
  setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], "");
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_guide"], null);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], []);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mask"], null);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt_enhancer"], "");
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["num_inference_steps", "steps"], request.steps, true);
  if (hasDiscoveredSetting(schema, defaults, ["guidance_scale", "cfg_scale"])) {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_scale", "cfg_scale"], krea2GuidanceScale(request.guidanceScale, modelType), request.guidanceScale !== undefined);
  }
  applySamplingSettings(settings, schema, defaults, modelType, request);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["count", "num_outputs", "batch_size"], request.count === 1 ? undefined : request.count);
  applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  return settings;
}

/** Turbo is step-distilled with `guidance_max_phases: 0`, so CFG must stay at 0. */
export function krea2GuidanceScale(guidanceScale: number | undefined, modelType: string) {
  if (hasKrea2DistilledMarker(modelType)) return 0;
  return guidanceScale;
}
