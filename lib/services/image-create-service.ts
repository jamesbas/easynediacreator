import type { ImageCreateRequest } from "@/lib/requests";
import { createJob } from "@/lib/runtime/job-registry";
import { getModels } from "@/lib/runtime/model-cache";
import { buildFluxKleinImageSettings } from "@/lib/wan-gp/adapters/flux-klein-image";
import { buildQwenImageSettings } from "@/lib/wan-gp/adapters/qwen-image";
import { enqueueJob } from "./job-runner";
import { validateModelLoras } from "./lora-service";

export async function createImage(request: ImageCreateRequest) {
  const model = (await getModels()).find((candidate) => candidate.workflowType === "image-create" && candidate.key === request.modelKey);
  if (!model?.modelType || model.availability !== "available") throw new Error("Selected image model is not available.");
  const normalizedRequest = { ...request, loras: validateModelLoras(request.loras, model.loraCatalog) };
  const settings = request.modelKey === "qwen-image" ? buildQwenImageSettings(normalizedRequest, model.defaults, model.schema, model.modelType) : buildFluxKleinImageSettings(normalizedRequest, model.defaults, model.schema, model.modelType);
  const job = createJob({ workflowType: "image-create", modelKey: request.modelKey, prompt: request.prompt });
  enqueueJob({ jobId: job.id, modelType: model.modelType, settings });
  return job;
}