import type { ImageCreateRequest } from "@/lib/requests";
import { createJob } from "@/lib/runtime/job-registry";
import { getModels } from "@/lib/runtime/model-cache";
import { buildFluxKleinImageSettings } from "@/lib/wan-gp/adapters/flux-klein-image";
import { buildQwenImageSettings } from "@/lib/wan-gp/adapters/qwen-image";
import { getGenerationControls, validateGenerationControls } from "@/lib/wan-gp/generation-controls";
import { FLUX_KLEIN_IMAGE_PRESET } from "@/lib/wan-gp/image-presets";
import { enqueueJob } from "./job-runner";
import { applyLoraAccelerationPreset, resolveLoraPreset, validateModelLoras } from "./lora-service";

export async function createImage(request: ImageCreateRequest) {
  const model = (await getModels()).find((candidate) => candidate.workflowType === "image-create" && candidate.key === request.modelKey);
  if (!model?.modelType || model.availability !== "available") throw new Error("Selected image model is not available.");
  const normalizedRequest = { ...request, loras: validateModelLoras(request.loras, model.loraCatalog) };
  const fluxPreset = model.key === "flux-klein-9b" ? FLUX_KLEIN_IMAGE_PRESET : undefined;
  const controlDefaults = fluxPreset ? { ...model.defaults, resolution: fluxPreset.defaultResolution, num_inference_steps: fluxPreset.defaultSteps } : model.defaults;
  const controls = getGenerationControls(model.schema, controlDefaults, { workflow: "image", fallbackResolutions: fluxPreset ? [...fluxPreset.resolutions] : [], fallbackResolution: fluxPreset?.defaultResolution ?? (typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1024x1024") });
  validateGenerationControls(normalizedRequest, controls);
  const preset = resolveLoraPreset(request.loraPresetId, normalizedRequest.loras, model.loraCatalog, model.modelType, "image-create");
  const settings = request.modelKey === "qwen-image" ? buildQwenImageSettings(normalizedRequest, model.defaults, model.schema, model.modelType) : buildFluxKleinImageSettings(normalizedRequest, model.defaults, model.schema, model.modelType);
  applyLoraAccelerationPreset(settings, preset, normalizedRequest.loras);
  const job = createJob({ workflowType: "image-create", modelKey: request.modelKey, prompt: request.prompt, requestSnapshot: { workflowType: "image-create", request: normalizedRequest } });
  enqueueJob({ jobId: job.id, modelType: model.modelType, settings });
  return job;
}