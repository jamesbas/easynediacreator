import type { ImageCreateRequest, LoraSelection } from "@/lib/requests";

function knownKeys(schema: Record<string, unknown>, defaults: Record<string, unknown>) {
  const keys = new Set(Object.keys(defaults));
  for (const containerName of ["properties", "settings"]) {
    const container = schema[containerName];
    if (container && typeof container === "object" && !Array.isArray(container)) Object.keys(container).forEach((key) => keys.add(key));
  }
  if (Array.isArray(schema.fields)) for (const field of schema.fields) if (field && typeof field === "object") { const name = "name" in field ? field.name : "key" in field ? field.key : undefined; if (typeof name === "string") keys.add(name); }
  const metadata = schema.metadata && typeof schema.metadata === "object" && !Array.isArray(schema.metadata) ? schema.metadata as Record<string, unknown> : {};
  for (const settingValues of [schema.setting_values, metadata.setting_values]) {
    if (settingValues && typeof settingValues === "object" && !Array.isArray(settingValues)) Object.keys(settingValues).forEach((key) => keys.add(key));
  }
  const mediaInputs = metadata.media_inputs && typeof metadata.media_inputs === "object" && !Array.isArray(metadata.media_inputs) ? metadata.media_inputs as Record<string, unknown> : {};
  const imageInputs = mediaInputs.image && typeof mediaInputs.image === "object" && !Array.isArray(mediaInputs.image) ? mediaInputs.image as Record<string, unknown> : {};
  if (imageInputs.start === true) keys.add("image_start");
  if (imageInputs.end === true) keys.add("image_end");
  if (imageInputs.reference === true) keys.add("image_refs");
  if (imageInputs.control === true) keys.add("image_guide");
  if (imageInputs.mask === true) keys.add("image_mask");
  return keys;
}

export function setDiscoveredSetting(target: Record<string, unknown>, schema: Record<string, unknown>, defaults: Record<string, unknown>, modelType: string, candidates: string[], value: unknown, required = false) {
  if (value === undefined) return undefined;
  const key = candidates.find((candidate) => knownKeys(schema, defaults).has(candidate)) ?? (modelType.endsWith("_fixture") ? candidates[0] : undefined);
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
  const durationKey = setDiscoveredSetting(target, schema, defaults, modelType, ["duration_seconds", "duration"], durationSeconds);
  if (!durationKey) setDiscoveredSetting(target, schema, defaults, modelType, ["video_length", "num_frames", "frame_num"], durationToFrameCount(durationSeconds, fps), true);
}

export function commonImageSettings(request: ImageCreateRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mode"], 1, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], "", true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], "", true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_guide"], null);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], []);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mask"], null);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt_enhancer"], "");
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt"], request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["num_inference_steps", "steps"], request.steps, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["count", "num_outputs", "batch_size"], request.count === 1 ? undefined : request.count);
  applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  return settings;
}