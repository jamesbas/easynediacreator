import type { VideoCreateRequest } from "@/lib/requests";
import { createJob } from "@/lib/runtime/job-registry";
import { getModels } from "@/lib/runtime/model-cache";
import { getOutput } from "@/lib/runtime/output-registry";
import { getUpload } from "@/lib/uploads/storage";
import { buildLtx2VideoSettings } from "@/lib/wan-gp/adapters/ltx2-video";
import { enqueueJob } from "./job-runner";
import { validateModelLoras } from "./lora-service";

function imagePath(uploadId?: string, assetId?: string) {
  if (uploadId) return getUpload(uploadId)?.path;
  if (assetId) { const asset = getOutput(assetId); return asset?.type === "image" ? asset.path : undefined; }
}

export async function createVideo(request: VideoCreateRequest) {
  const model = (await getModels()).find((candidate) => candidate.workflowType === "video-create" && candidate.key === request.modelKey);
  if (!model?.modelType || model.availability !== "available") throw new Error("Selected video model is not available.");
  const startPath = imagePath(request.startUploadId, request.startAssetId);
  if (!startPath) throw new Error("Start image could not be found.");
  const endPath = imagePath(request.endUploadId, request.endAssetId);
  if ((request.endUploadId || request.endAssetId) && !endPath) throw new Error("End image could not be found.");
  if (endPath && !model.capabilities.includes("end-frame")) throw new Error("End frame is not supported by this LTX-2 configuration.");
  const normalizedRequest = { ...request, loras: validateModelLoras(request.loras, model.loraCatalog) };
  const settings = buildLtx2VideoSettings(normalizedRequest, model.defaults, model.schema, model.modelType, startPath, endPath);
  const job = createJob({ workflowType: "video-create", modelKey: request.modelKey, prompt: request.prompt });
  enqueueJob({ jobId: job.id, modelType: model.modelType, settings });
  return job;
}