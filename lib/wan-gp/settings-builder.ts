import type { ImageCreateRequest, LoraSelection } from "@/lib/requests";
import { REFERENCE_SUBJECTS_ONLY } from "./reference-images";

function explicitKeys(schema: Record<string, unknown>, defaults: Record<string, unknown>) {
  const keys = new Set(Object.keys(defaults));
  for (const containerName of ["properties", "settings"]) {
    const container = schema[containerName];
    if (container && typeof container === "object" && !Array.isArray(container)) Object.keys(container).forEach((key) => keys.add(key));
  }
  if (Array.isArray(schema.fields)) for (const field of schema.fields) if (field && typeof field === "object") { const name = "name" in field ? field.name : "key" in field ? field.key : undefined; if (typeof name === "string") keys.add(name); }
  const metadata = schema.metadata && typeof schema.metadata === "object" && !Array.isArray(schema.metadata) ? schema.metadata as Record<string, unknown> : {};
  const modelDefinition = schema.model_def && typeof schema.model_def === "object" && !Array.isArray(schema.model_def) ? schema.model_def as Record<string, unknown> : {};
  if (Array.isArray(modelDefinition.sample_solvers)) keys.add("sample_solver");
  for (const settingValues of [schema.setting_values, metadata.setting_values]) {
    if (settingValues && typeof settingValues === "object" && !Array.isArray(settingValues)) Object.keys(settingValues).forEach((key) => keys.add(key));
  }
  return keys;
}

function knownKeys(schema: Record<string, unknown>, defaults: Record<string, unknown>) {
  const keys = explicitKeys(schema, defaults);
  const metadata = schema.metadata && typeof schema.metadata === "object" && !Array.isArray(schema.metadata) ? schema.metadata as Record<string, unknown> : {};
  const mediaInputs = metadata.media_inputs && typeof metadata.media_inputs === "object" && !Array.isArray(metadata.media_inputs) ? metadata.media_inputs as Record<string, unknown> : {};
  const imageInputs = mediaInputs.image && typeof mediaInputs.image === "object" && !Array.isArray(mediaInputs.image) ? mediaInputs.image as Record<string, unknown> : {};
  if (imageInputs.start === true) keys.add("image_start");
  if (imageInputs.end === true) keys.add("image_end");
  if (imageInputs.reference === true) keys.add("image_refs");
  if (imageInputs.control === true) keys.add("image_guide");
  if (imageInputs.mask === true) keys.add("image_mask");
  // WanGP only writes `activated_loras` into a model's saved defaults after a
  // LoRA has been picked for it in the WanGP UI, so the capability flag rather
  // than the defaults is what proves the setting is accepted.
  const capabilities = metadata.capabilities && typeof metadata.capabilities === "object" && !Array.isArray(metadata.capabilities) ? metadata.capabilities as Record<string, unknown> : {};
  if (capabilities.lora === true) { keys.add("activated_loras"); keys.add("loras_multipliers"); }
  return keys;
}

export function hasExplicitSetting(schema: Record<string, unknown>, defaults: Record<string, unknown>, candidates: string[]) {
  const keys = explicitKeys(schema, defaults);
  return candidates.some((candidate) => keys.has(candidate));
}

export function hasDiscoveredSetting(schema: Record<string, unknown>, defaults: Record<string, unknown>, candidates: string[]) {
  const keys = knownKeys(schema, defaults);
  return candidates.some((candidate) => keys.has(candidate));
}

export function setDiscoveredSetting(target: Record<string, unknown>, schema: Record<string, unknown>, defaults: Record<string, unknown>, modelType: string, candidates: string[], value: unknown, required = false) {
  if (value === undefined) return undefined;
  const key = candidates.find((candidate) => hasDiscoveredSetting(schema, defaults, [candidate])) ?? (modelType.endsWith("_fixture") ? candidates[0] : undefined);
  if (!key) { if (required) throw new Error(`The installed WanGP schema does not expose a supported ${candidates[0]} setting.`); return undefined; }
  target[key] = value;
  return key;
}

export function applyLoraSettings(target: Record<string, unknown>, schema: Record<string, unknown>, defaults: Record<string, unknown>, modelType: string, loras: LoraSelection[]) {
  const required = loras.length > 0;
  setDiscoveredSetting(target, schema, defaults, modelType, ["activated_loras"], loras.map((lora) => lora.name), required);
  setDiscoveredSetting(target, schema, defaults, modelType, ["loras_multipliers"], loras.map((lora) => `${lora.strength}`).join(" "), required);
}

export function durationToFrameCount(durationSeconds: number, fps: number) {
  return Math.ceil(durationSeconds * fps / 8) * 8 + 1;
}

export function applyVideoDuration(target: Record<string, unknown>, schema: Record<string, unknown>, defaults: Record<string, unknown>, modelType: string, durationSeconds: number | undefined, fps: number) {
  if (durationSeconds === undefined) return;
  if (modelType.toLowerCase().startsWith("ltx2") || hasDiscoveredSetting(schema, defaults, ["video_length", "num_frames", "frame_num"])) {
    setDiscoveredSetting(target, schema, defaults, modelType, ["video_length", "num_frames", "frame_num"], durationToFrameCount(durationSeconds, fps), true);
    setDiscoveredSetting(target, schema, defaults, modelType, ["duration_seconds"], 0);
    return;
  }
  setDiscoveredSetting(target, schema, defaults, modelType, ["duration_seconds"], durationSeconds, true);
}

export function applySamplingSettings(target: Record<string, unknown>, schema: Record<string, unknown>, defaults: Record<string, unknown>, modelType: string, request: { sampleSolver?: string; scheduler?: string }) {
  setDiscoveredSetting(target, schema, defaults, modelType, ["sample_solver"], request.sampleSolver, request.sampleSolver !== undefined);
  setDiscoveredSetting(target, schema, defaults, modelType, ["scheduler", "scheduler_type", "scheduler_name"], request.scheduler, request.scheduler !== undefined);
}

export function commonImageSettings(request: ImageCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string, referencePaths: string[] = []) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mode"], 1, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], "", true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_guide"], null);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mask"], null);
  if (referencePaths.length) {
    // No source frame is sent when creating, so every reference is a person or
    // object: "I" rather than "KI". Both fields are required because WanGP
    // ignores `image_refs` unless the letter is present.
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], referencePaths, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], REFERENCE_SUBJECTS_ONLY, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs_relative_size"], 50);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["remove_background_images_ref"], 1);
  } else {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], "", true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], []);
  }
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt_enhancer"], "");
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt"], request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_scale"], request.guidanceScale, request.guidanceScale !== undefined);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["num_inference_steps", "steps"], request.steps, true);
  applySamplingSettings(settings, schema, defaults, modelType, request);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["count", "num_outputs", "batch_size"], request.count === 1 ? undefined : request.count);
  applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  return settings;
}