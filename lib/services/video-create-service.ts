import type { VideoCreateRequest } from "@/lib/requests";
import { createJob } from "@/lib/runtime/job-registry";
import { getModels } from "@/lib/runtime/model-cache";
import { getOutput } from "@/lib/runtime/output-registry";
import { getUpload } from "@/lib/uploads/storage";
import { buildVideoSettings } from "@/lib/wan-gp/adapters/video";
import { getGenerationControls, validateGenerationControls } from "@/lib/wan-gp/generation-controls";
import { getVideoFallbackResolutions } from "@/lib/wan-gp/video-presets";
import { enqueueJob } from "./job-runner";
import { applyLoraAccelerationPreset, resolveLoraPreset, validateModelLoras } from "./lora-service";

function imagePath(uploadId?: string, assetId?: string) {
  if (uploadId) return getUpload(uploadId)?.path;
  if (assetId) { const asset = getOutput(assetId); return asset?.type === "image" ? asset.path : undefined; }
}

export async function createVideo(request: VideoCreateRequest) {
  const videoModels = (await getModels()).filter((candidate) => candidate.workflowType === "video-create");
  const model = videoModels.find((candidate) => candidate.key === request.modelKey)
    ?? (request.modelKey === "ltx-2" ? videoModels.find((candidate) => candidate.availability === "available" && candidate.modelType?.toLowerCase().startsWith("ltx2")) : undefined);
  if (!model?.modelType || model.availability !== "available") throw new Error("Selected video model is not available.");
  const startPath = imagePath(request.startUploadId, request.startAssetId);
  if ((request.startUploadId || request.startAssetId) && !startPath) throw new Error("Start image could not be found.");
  const endPath = imagePath(request.endUploadId, request.endAssetId);
  if ((request.endUploadId || request.endAssetId) && !endPath) throw new Error("End image could not be found.");
  if (startPath && !model.capabilities.includes("start-frame")) throw new Error("Start images are not supported by the selected video model.");
  if (!startPath && !model.capabilities.includes("text-to-video")) throw new Error("The selected video model requires a start image.");
  if (endPath && !model.capabilities.includes("end-frame")) throw new Error("End images are not supported by the selected video model.");
  const normalizedRequest = { ...request, loras: validateModelLoras(request.loras, model.loraCatalog) };
  const defaultResolution = typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1280x720";
  const controls = getGenerationControls(model.schema, model.defaults, { workflow: "video", fallbackResolutions: getVideoFallbackResolutions(model.key, defaultResolution), fallbackResolution: defaultResolution });
  validateGenerationControls(normalizedRequest, controls);
  const preset = resolveLoraPreset(request.loraPresetId, normalizedRequest.loras, model.loraCatalog, model.modelType, "video-create");
  const settings = buildVideoSettings(normalizedRequest, model.defaults, model.schema, model.modelType, startPath, endPath);
  applyLoraAccelerationPreset(settings, preset, normalizedRequest.loras);
  const job = createJob({ workflowType: "video-create", modelKey: request.modelKey, prompt: request.prompt, requestSnapshot: { workflowType: "video-create", request: normalizedRequest } });
  enqueueJob({ jobId: job.id, modelType: model.modelType, settings });
  return job;
}