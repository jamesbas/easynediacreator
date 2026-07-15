import { config } from "@/lib/config";
import type { ModelOption, WorkflowType } from "@/lib/types";
import type { WanGpClient, WanGpModelSummary } from "./client";
import { classifyLoraCatalog } from "./lora-classifier/classify";

export type LogicalRule = { key: string; displayName: string; workflowType: WorkflowType; family: string; output: "image" | "video"; requiresImage?: boolean; namePattern?: RegExp };

const rules: LogicalRule[] = [
  { key: "qwen-image", displayName: "Qwen Image", workflowType: "image-create", family: "qwen", output: "image", namePattern: /qwen(?!.*edit)/i },
  { key: "flux-klein-9b", displayName: "Flux.2 Klein 9B", workflowType: "image-create", family: "flux", output: "image", namePattern: /klein.*9b/i },
  { key: "qwen-image-edit", displayName: "Qwen Image Edit", workflowType: "image-edit", family: "qwen", output: "image", requiresImage: true, namePattern: /qwen.*edit/i },
  { key: "flux-klein-9b", displayName: "Flux.2 Klein 9B", workflowType: "image-edit", family: "flux", output: "image", requiresImage: true, namePattern: /klein.*9b/i },
  { key: "ltx-2", displayName: "LTX-2", workflowType: "video-create", family: "ltx2", output: "video", requiresImage: true, namePattern: /ltx.?2/i },
];

function enabled(rule: LogicalRule) {
  const keys = rule.workflowType === "image-create" ? config.enabledModels.imageCreate : rule.workflowType === "image-edit" ? config.enabledModels.imageEdit : config.enabledModels.videoCreate;
  return keys.includes(rule.key);
}

export function getWanGpCapabilities(metadata: Record<string, unknown>) {
  const capabilities = Array.isArray(metadata.capabilities)
    ? metadata.capabilities.filter((value): value is string => typeof value === "string")
    : metadata.capabilities && typeof metadata.capabilities === "object"
      ? Object.entries(metadata.capabilities).filter(([, supported]) => supported === true).map(([name]) => name.replaceAll("_", "-"))
      : [];
  const mediaInputs = metadata.media_inputs;
  const imageInputs = mediaInputs && typeof mediaInputs === "object" && "image" in mediaInputs ? mediaInputs.image : undefined;
  if (imageInputs && typeof imageInputs === "object") {
    if ("start" in imageInputs && imageInputs.start === true) capabilities.push("start-frame");
    if ("end" in imageInputs && imageInputs.end === true) capabilities.push("end-frame");
  }
  return [...new Set(capabilities)];
}

export function selectionKey(rule: Pick<LogicalRule, "workflowType" | "key">) { return `${rule.workflowType}:${rule.key}`; }

export function matchingModels(rule: LogicalRule, models: WanGpModelSummary[]) {
  return models.filter((model) => {
    const family = model.family.toLowerCase();
    const familyMatches = rule.family === "flux" ? family === "flux" || family === "flux2" : family === rule.family;
    return familyMatches && model.output === rule.output && (!rule.requiresImage || model.inputs.includes("image")) && (!rule.namePattern || rule.namePattern.test(model.name));
  });
}

export function matchModel(rule: LogicalRule, models: WanGpModelSummary[], preferredModelType?: string) {
  const matches = matchingModels(rule, models);
  const preferred = matches.find((model) => model.modelType === preferredModelType && model.availability === "available");
  if (preferred) return preferred;
  if (rule.key === "ltx-2") {
    const distilled = matches.find((model) => model.availability === "available" && /distilled.*1\.1/i.test(model.name)) ?? matches.find((model) => model.availability === "available" && /distilled/i.test(model.name));
    if (distilled) return distilled;
  }
  return matches.find((model) => model.availability === "available") ?? matches.find((model) => model.availability === "partial") ?? matches[0];
}

export async function discoverModels(client: WanGpClient, selections: Record<string, string> = {}): Promise<ModelOption[]> {
  const models = [...await client.listModels("image"), ...await client.listModels("video")];
  return Promise.all(rules.filter(enabled).map(async (rule) => {
    const matches = matchingModels(rule, models);
    const candidates = matches.map(({ modelType, name, availability }) => ({ modelType, name, availability }));
    const model = matchModel(rule, models, selections[selectionKey(rule)]);
    if (!model) return { key: rule.key, displayName: rule.displayName, workflowType: rule.workflowType, availability: "missing" as const, reason: "No matching installed WanGP model was found.", schema: {}, defaults: {}, capabilities: [], loraCatalog: { supported: false, loras: [], reason: "Model is not installed." }, candidates };
    const [availability, schema, defaults, metadata, loraCatalog] = await Promise.all([
      client.getModelAvailability(model.modelType), client.getModelSchema(model.modelType).catch(() => ({})), client.getDefaultSettings(model.modelType), client.getModelMetadata(model.modelType), client.listLoras(model.modelType),
    ]);
    const effectiveSchema = Object.keys(schema).length ? schema : { metadata };
    const capabilities = getWanGpCapabilities(metadata);
    const classifiedCatalog = await classifyLoraCatalog({ catalog: loraCatalog, schema: effectiveSchema, metadata, modelType: model.modelType, workflowType: rule.workflowType, profilesRoot: config.WANGP_PROFILES_ROOT, metadataRoot: config.WANGP_LORA_METADATA_ROOT, overridesPath: config.WANGP_LORA_CLASSIFIER_OVERRIDES });
    return { key: rule.key, displayName: model.name || rule.displayName, workflowType: rule.workflowType, modelType: model.modelType, availability: availability.status, reason: availability.reason, schema: effectiveSchema, defaults, capabilities, loraCatalog: classifiedCatalog, candidates };
  }));
}