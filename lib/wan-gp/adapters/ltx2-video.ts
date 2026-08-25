import type { VideoCreateRequest } from "@/lib/requests";
import { buildVideoSettings } from "./video";

export function buildLtx2VideoSettings(request: VideoCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string, startPath: string, endPath?: string) {
  return buildVideoSettings(request, defaults, schema, modelType, startPath, endPath);
}