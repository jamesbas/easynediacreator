import type { ImageCreateRequest } from "@/lib/requests";
import { FLUX_KLEIN_IMAGE_PRESET } from "../image-presets";
import { commonImageSettings, setDiscoveredSetting } from "../settings-builder";

export function buildFluxKleinImageSettings(request: ImageCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string) {
  const settings = commonImageSettings({ ...request, resolution: request.resolution ?? FLUX_KLEIN_IMAGE_PRESET.defaultResolution }, defaults, schema, modelType);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["override_profile"], FLUX_KLEIN_IMAGE_PRESET.memoryProfile, true);
  return settings;
}