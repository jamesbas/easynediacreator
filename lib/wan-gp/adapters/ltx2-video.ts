import type { VideoCreateRequest } from "@/lib/requests";
import { applyLoraSettings, applyVideoDuration, setDiscoveredSetting } from "../settings-builder";

export function buildLtx2VideoSettings(request: VideoCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string, startPath: string, endPath?: string) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt"], request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["num_inference_steps", "steps"], request.steps, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], `S${endPath ? "E" : ""}`, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_start", "start_image", "start_frame", "input_image", "image"], startPath, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_end", "end_image", "end_frame"], endPath, Boolean(endPath));
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  const defaultFps = Number(defaults.force_fps ?? defaults.fps ?? defaults.frame_rate);
  const fps = request.fps ?? (Number.isFinite(defaultFps) && defaultFps > 0 ? defaultFps : 24);
  applyVideoDuration(settings, schema, defaults, modelType, request.durationSeconds, fps);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["force_fps", "fps", "frames_per_second"], request.fps);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  return settings;
}