import type { ImageEditRequest } from "@/lib/requests";
import { applyLoraSettings, setDiscoveredSetting } from "../settings-builder";

export function buildFluxKleinEditSettings(request: ImageEditRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string, sourcePath: string) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt", "instruction"], request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["source_image", "input_image", "image"], sourcePath, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  return settings;
}