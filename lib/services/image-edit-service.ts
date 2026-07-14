import type { ImageEditRequest } from "@/lib/requests";
import { createJob } from "@/lib/runtime/job-registry";
import { getModels } from "@/lib/runtime/model-cache";
import { getOutput } from "@/lib/runtime/output-registry";
import { getUpload } from "@/lib/uploads/storage";
import { buildFluxKleinEditSettings } from "@/lib/wan-gp/adapters/flux-klein-edit";
import { buildQwenImageEditSettings } from "@/lib/wan-gp/adapters/qwen-image-edit";
import { enqueueJob } from "./job-runner";
import { validateModelLoras } from "./lora-service";

export async function editImage(request: ImageEditRequest) {
  const model = (await getModels()).find((candidate) => candidate.workflowType === "image-edit" && candidate.key === request.modelKey);
  if (!model?.modelType || model.availability !== "available") throw new Error("Selected image-edit model is not available.");
  const source = request.sourceUploadId ? getUpload(request.sourceUploadId)?.path : request.sourceAssetId ? getOutput(request.sourceAssetId)?.path : undefined;
  if (!source) throw new Error("Source image could not be found.");
  if (request.sourceAssetId && getOutput(request.sourceAssetId)?.type !== "image") throw new Error("Choose an image output as the source.");
  const normalizedRequest = { ...request, loras: validateModelLoras(request.loras, model.loraCatalog) };
  const settings = request.modelKey === "qwen-image-edit" ? buildQwenImageEditSettings(normalizedRequest, model.defaults, model.schema, model.modelType, source) : buildFluxKleinEditSettings(normalizedRequest, model.defaults, model.schema, model.modelType, source);
  const job = createJob({ workflowType: "image-edit", modelKey: request.modelKey, prompt: request.prompt });
  enqueueJob({ jobId: job.id, modelType: model.modelType, settings });
  return job;
}