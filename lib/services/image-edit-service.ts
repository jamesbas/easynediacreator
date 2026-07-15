import type { ImageEditRequest } from "@/lib/requests";
import { FACE_SWAP_LORAS, FACE_SWAP_PROMPT } from "@/lib/face-swap-preset";
import { createJob } from "@/lib/runtime/job-registry";
import { getModels } from "@/lib/runtime/model-cache";
import { getOutput } from "@/lib/runtime/output-registry";
import { getUpload } from "@/lib/uploads/storage";
import { SHARPEN_UNBLUR_LORA } from "@/lib/sharpen-unblur-preset";
import { buildFluxKleinEditSettings } from "@/lib/wan-gp/adapters/flux-klein-edit";
import { buildQwenImageEditSettings } from "@/lib/wan-gp/adapters/qwen-image-edit";
import { enqueueJob } from "./job-runner";
import { applyLoraAccelerationPreset, resolveLoraPreset, validateModelLoras } from "./lora-service";

export async function editImage(request: ImageEditRequest) {
  const model = (await getModels()).find((candidate) => candidate.workflowType === "image-edit" && candidate.key === request.modelKey);
  if (!model?.modelType || model.availability !== "available") throw new Error("Selected image-edit model is not available.");
  const source = request.sourceUploadId ? getUpload(request.sourceUploadId)?.path : request.sourceAssetId ? getOutput(request.sourceAssetId)?.path : undefined;
  if (!source) throw new Error("Source image could not be found.");
  if (request.sourceAssetId && getOutput(request.sourceAssetId)?.type !== "image") throw new Error("Choose an image output as the source.");
  const referenceUploads = (request.referenceUploadIds ?? []).map((id) => getUpload(id)?.path);
  const referenceAssets = (request.referenceAssetIds ?? []).map((id) => {
    const asset = getOutput(id);
    if (asset && asset.type !== "image") throw new Error("Choose only image outputs as references.");
    return asset?.path;
  });
  const references = [...referenceUploads, ...referenceAssets];
  if (references.some((reference) => !reference)) throw new Error("A reference image could not be found.");
  if (references.length && request.modelKey !== "qwen-image-edit") throw new Error("Reference images currently require Qwen Image Edit.");
  if (request.faceSwap) {
    const faceLora = FACE_SWAP_LORAS[1].name.toLocaleLowerCase();
    if (!model.loraCatalog.supported || !model.loraCatalog.loras.some((name) => name.toLocaleLowerCase() === faceLora)) throw new Error(`Face swap requires '${FACE_SWAP_LORAS[1].name}' in the Qwen LoRA catalog.`);
  }
  if (request.sharpenUnblur) {
    const requiredLora = SHARPEN_UNBLUR_LORA.name.toLocaleLowerCase();
    if (request.faceSwap || request.loras.length || request.loraPresetId) throw new Error("Sharpen and Unblur cannot be combined with Face Swap, acceleration presets, or other LoRAs.");
    if (request.modelKey !== "qwen-image-edit") throw new Error("Sharpen and Unblur requires Qwen Image Edit.");
    if (!model.loraCatalog.supported || !model.loraCatalog.loras.some((name) => name.toLocaleLowerCase() === requiredLora)) throw new Error(`Sharpen and Unblur requires '${SHARPEN_UNBLUR_LORA.name}' in the Qwen LoRA catalog.`);
  }
  const normalizedRequest = { ...request, prompt: request.faceSwap ? FACE_SWAP_PROMPT : request.prompt, loras: validateModelLoras(request.loras, model.loraCatalog) };
  const preset = resolveLoraPreset(request.loraPresetId, normalizedRequest.loras, model.loraCatalog, model.modelType, "image-edit");
  const referencePaths = references.filter((reference): reference is string => Boolean(reference));
  const settings = request.modelKey === "qwen-image-edit" ? buildQwenImageEditSettings(normalizedRequest, model.defaults, model.schema, model.modelType, source, referencePaths) : buildFluxKleinEditSettings(normalizedRequest, model.defaults, model.schema, model.modelType, source);
  applyLoraAccelerationPreset(settings, preset, normalizedRequest.loras);
  if (request.sharpenUnblur) {
    settings.activated_loras = [SHARPEN_UNBLUR_LORA.name];
    settings.loras_multipliers = `${SHARPEN_UNBLUR_LORA.strength}`;
  }
  const job = createJob({ workflowType: "image-edit", modelKey: request.modelKey, prompt: normalizedRequest.prompt, requestSnapshot: { workflowType: "image-edit", request: normalizedRequest } });
  enqueueJob({ jobId: job.id, modelType: model.modelType, settings });
  return job;
}