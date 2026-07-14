import type { ImageCreateRequest } from "@/lib/requests";
import { commonImageSettings } from "../settings-builder";

export function buildQwenImageSettings(request: ImageCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string) {
  return commonImageSettings(request, defaults, schema, modelType);
}