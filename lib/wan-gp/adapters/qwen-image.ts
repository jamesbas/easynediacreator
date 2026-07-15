import type { ImageCreateRequest } from "@/lib/requests";
import { qwenImageGuidanceScale } from "../image-guidance";
import { commonImageSettings } from "../settings-builder";

export function buildQwenImageSettings(request: ImageCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string) {
  return commonImageSettings({ ...request, guidanceScale: qwenImageGuidanceScale(request, defaults, modelType) }, defaults, schema, modelType);
}