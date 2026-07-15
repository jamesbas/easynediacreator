import type { ImageEditRequest } from "@/lib/requests";
import { FACE_SWAP_LORAS, FACE_SWAP_PROMPT, FACE_SWAP_STEPS } from "@/lib/face-swap-preset";
import { applyLoraSettings, setDiscoveredSetting } from "../settings-builder";

export function buildQwenImageEditSettings(request: ImageEditRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string, sourcePath: string, referencePaths: string[] = []) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt", "instruction"], request.faceSwap ? FACE_SWAP_PROMPT : request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt, true);
  if (referencePaths.length) {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mode"], 1, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_guide"], sourcePath, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], referencePaths, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], "", true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], "IV", true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs_relative_size"], 50, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["remove_background_images_ref"], 1, true);
  } else {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], [sourcePath], true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], "KI", true);
  }
  setDiscoveredSetting(settings, schema, defaults, modelType, ["num_inference_steps", "steps"], request.faceSwap ? FACE_SWAP_STEPS : request.steps, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  if (request.faceSwap) {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["sample_solver"], "lightning", true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_scale"], 1, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_phases"], 1, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["model_mode"], 1, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["masking_strength"], 1, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["mask_expand"], 0, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["activated_loras"], FACE_SWAP_LORAS.map((lora) => lora.name), true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["loras_multipliers"], FACE_SWAP_LORAS.map((lora) => `${lora.strength}`).join(" "), true);
  } else {
    applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  }
  return settings;
}