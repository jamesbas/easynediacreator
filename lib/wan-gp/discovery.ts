import { config } from "@/lib/config";
import type { ModelOption, WorkflowType } from "@/lib/types";
import type { WanGpClient, WanGpModelSummary } from "./client";
import { classifyLoraCatalog } from "./lora-classifier/classify";
import { REFERENCE_IMAGE_CAPABILITY } from "./reference-images";
import { hasExplicitSetting } from "./settings-builder";

export type LogicalRule = { key: string; displayName: string; workflowType: WorkflowType; family: string; output: "image" | "video"; requiresImage?: boolean; modelType?: string; namePattern?: RegExp; preferredPatterns?: RegExp[]; maxReferenceImages?: number; sourceUsesReferenceSlot?: boolean };

const rules: LogicalRule[] = [
  { key: "qwen-image", displayName: "Qwen Image", workflowType: "image-create", family: "qwen", output: "image", namePattern: /qwen(?!.*edit)/i, maxReferenceImages: 8 },
  { key: "flux-klein-9b", displayName: "Flux.2 Klein 9B", workflowType: "image-create", family: "flux", output: "image", namePattern: /klein.*9b/i, maxReferenceImages: 4 },
  // Krea 2 RAW and Turbo are text-to-image only: WanGP publishes `image_ref_choices`
  // on the Identity Edit checkpoints alone, so a reference sent here is discarded.
  { key: "krea-2", displayName: "Krea 2", workflowType: "image-create", family: "krea2", output: "image", namePattern: /krea(?!.*edit)/i, preferredPatterns: [/turbo/i] },
  { key: "qwen-image-edit", displayName: "Qwen Image Edit", workflowType: "image-edit", family: "qwen", output: "image", requiresImage: true, namePattern: /qwen.*edit/i, maxReferenceImages: 8 },
  { key: "flux-klein-9b", displayName: "Flux.2 Klein 9B", workflowType: "image-edit", family: "flux", output: "image", requiresImage: true, namePattern: /klein.*9b/i },
  // Krea 2 Identity Edit conditions on three `image_refs` entries in total, and
  // the image being edited occupies the first when one is supplied.
  { key: "krea-2-edit", displayName: "Krea 2 Identity Edit", workflowType: "image-edit", family: "krea2", output: "image", namePattern: /krea.*edit/i, preferredPatterns: [/turbo/i], maxReferenceImages: 3, sourceUsesReferenceSlot: true },
];

function enabled(rule: LogicalRule) {
  const keys = rule.workflowType === "image-create" ? config.enabledModels.imageCreate : rule.workflowType === "image-edit" ? config.enabledModels.imageEdit : [];
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
    if ("reference" in imageInputs && imageInputs.reference === true) capabilities.push(REFERENCE_IMAGE_CAPABILITY);
  }
  return [...new Set(capabilities)];
}

export function selectionKey(rule: Pick<LogicalRule, "workflowType" | "key">) { return `${rule.workflowType}:${rule.key}`; }

export function matchingModels(rule: LogicalRule, models: WanGpModelSummary[]) {
  return models.filter((model) => {
    const family = model.family.toLowerCase();
    const familyMatches = rule.family === "flux" ? family === "flux" || family === "flux2" : family === rule.family;
    return familyMatches && model.output === rule.output && (!rule.modelType || model.modelType === rule.modelType) && (!rule.requiresImage || model.inputs.includes("image")) && (!rule.namePattern || rule.namePattern.test(model.name));
  });
}

export function matchModel(rule: LogicalRule, models: WanGpModelSummary[], preferredModelType?: string) {
  const matches = matchingModels(rule, models);
  const preferred = matches.find((model) => model.modelType === preferredModelType && model.availability === "available");
  if (preferred) return preferred;
  // Installed models outrank ones WanGP would have to download; only within a
  // tier does the rule's preferred variant break the tie, so a fast checkpoint
  // that is missing never displaces a slower one that is present.
  const tiers = [matches.filter((model) => model.availability === "available"), matches.filter((model) => model.availability === "partial"), matches];
  for (const tier of tiers) {
    if (!tier.length) continue;
    for (const pattern of rule.preferredPatterns ?? []) {
      const variant = tier.find((model) => pattern.test(model.name));
      if (variant) return variant;
    }
    return tier[0];
  }
  return undefined;
}

export async function discoverModels(client: WanGpClient, selections: Record<string, string> = {}): Promise<ModelOption[]> {
  const models = [...await client.listModels("image"), ...await client.listModels("video")];
  const videoModels = models.filter((model) => model.output === "video");
  const preferredVideoModel = selections[`video-create:${config.DEFAULT_VIDEO_MODEL}`] ?? config.DEFAULT_VIDEO_MODEL;
  const eligibleVideoModels = videoModels.filter((model) => model.availability !== "missing").sort((left, right) => Number(right.modelType === preferredVideoModel) - Number(left.modelType === preferredVideoModel));
  const dynamicVideoRules: LogicalRule[] = eligibleVideoModels.map((model) => ({
    key: model.modelType,
    displayName: model.name,
    workflowType: "video-create",
    family: model.family.toLowerCase(),
    output: "video",
    modelType: model.modelType,
  }));
  return Promise.all([...rules.filter(enabled), ...dynamicVideoRules].map(async (rule) => {
    const matches = matchingModels(rule, models);
    const candidates = rule.workflowType === "video-create" ? [] : matches.map(({ modelType, name, availability }) => ({ modelType, name, availability }));
    const model = matchModel(rule, models, selections[selectionKey(rule)]);
    if (!model) return { key: rule.key, displayName: rule.displayName, workflowType: rule.workflowType, availability: "missing" as const, reason: "No matching installed WanGP model was found.", schema: {}, defaults: {}, capabilities: [], loraCatalog: { supported: false, loras: [], reason: "Model is not installed." }, candidates };
    const [availability, schema, defaults, metadata, loraCatalog] = await Promise.all([
      client.getModelAvailability(model.modelType), client.getModelSchema(model.modelType).catch(() => ({})), client.getDefaultSettings(model.modelType), client.getModelMetadata(model.modelType), client.listLoras(model.modelType),
    ]);
    const effectiveSchema = Object.keys(schema).length ? schema : { metadata };
    // Reference support is declared by the rule as well as discovered, because WanGP
    // reports `media_inputs` inconsistently and a missed capability silently drops
    // every reference the user attached.
    const capabilities = [...new Set([...getWanGpCapabilities(metadata), ...(rule.maxReferenceImages ? [REFERENCE_IMAGE_CAPABILITY] : [])])];
    const sourceUsesReferenceSlot = rule.sourceUsesReferenceSlot || (rule.key === "qwen-image-edit" && !hasExplicitSetting(effectiveSchema, defaults, ["image_guide"]));
    const classifiedCatalog = await classifyLoraCatalog({ catalog: loraCatalog, schema: effectiveSchema, metadata, modelType: model.modelType, workflowType: rule.workflowType, profilesRoot: config.WANGP_PROFILES_ROOT, metadataRoot: config.WANGP_LORA_METADATA_ROOT, overridesPath: config.WANGP_LORA_CLASSIFIER_OVERRIDES });
    return { key: rule.key, displayName: model.name || rule.displayName, workflowType: rule.workflowType, modelType: model.modelType, availability: availability.status, reason: availability.reason, schema: effectiveSchema, defaults, capabilities, maxReferenceImages: rule.maxReferenceImages, sourceUsesReferenceSlot, loraCatalog: classifiedCatalog, candidates };
  }));
}