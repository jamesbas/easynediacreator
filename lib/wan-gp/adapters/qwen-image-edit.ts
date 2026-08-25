import type { ImageEditRequest } from "@/lib/requests";
import { FACE_SWAP_LORAS, faceSwapPrompt, FACE_SWAP_STEPS } from "@/lib/face-swap-preset";
import { REFERENCE_LEAD_WITH_SCENE, REFERENCE_SUBJECTS_ONLY } from "../reference-images";
import { applyLoraSettings, applySamplingSettings, hasExplicitSetting, setDiscoveredSetting } from "../settings-builder";

export function buildQwenImageEditSettings(request: ImageEditRequest, defaults: Record<string, unknown>, schema: Record<string, unknown>, modelType: string, sourcePath?: string, referencePaths: string[] = []) {
  if (Object.keys(request.advanced).length) throw new Error("The selected model does not allow these advanced settings.");
  const settings = { ...defaults };
  setDiscoveredSetting(settings, schema, defaults, modelType, ["prompt", "text_prompt", "instruction"], request.faceSwap ? faceSwapPrompt(request.faceSwapGender) : request.prompt, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["negative_prompt"], request.negativePrompt, true);
  if (sourcePath && referencePaths.length) {
    if (hasExplicitSetting(schema, defaults, ["image_guide"])) {
      setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mode"], 1, true);
      setDiscoveredSetting(settings, schema, defaults, modelType, ["image_guide"], sourcePath, true);
      setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], referencePaths, true);
      setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], "", true);
      setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], "IV", true);
    } else {
      setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], [sourcePath, ...referencePaths], true);
      setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], REFERENCE_LEAD_WITH_SCENE, true);
    }
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs_relative_size"], 50);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["remove_background_images_ref"], 1);
  } else if (sourcePath) {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], [sourcePath], true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], "KI", true);
  } else {
    // Nothing is being edited, so the checkpoint runs as plain text-to-image and
    // any reference is a person or object rather than the scene.
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mode"], 1);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_guide"], null);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_mask"], null);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_prompt_type"], "", true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs"], referencePaths, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["video_prompt_type"], referencePaths.length ? REFERENCE_SUBJECTS_ONLY : "", true);
    if (referencePaths.length) {
      setDiscoveredSetting(settings, schema, defaults, modelType, ["image_refs_relative_size"], 50);
      setDiscoveredSetting(settings, schema, defaults, modelType, ["remove_background_images_ref"], 1);
    }
  }
  setDiscoveredSetting(settings, schema, defaults, modelType, ["num_inference_steps", "steps"], request.faceSwap ? FACE_SWAP_STEPS : request.steps, true);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_scale", "cfg_scale"], request.guidanceScale, request.guidanceScale !== undefined);
  applySamplingSettings(settings, schema, defaults, modelType, request);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["resolution", "size"], request.resolution);
  setDiscoveredSetting(settings, schema, defaults, modelType, ["seed"], request.seed);
  if (request.faceSwap) {
    setDiscoveredSetting(settings, schema, defaults, modelType, ["sample_solver"], "lightning", true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_scale"], 1, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["guidance_phases"], 1, true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["model_mode"], 1, true);
    // Mask tuning only exists on checkpoints that expose an inpainting mask; the swap sends none.
    setDiscoveredSetting(settings, schema, defaults, modelType, ["masking_strength"], 1);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["mask_expand"], 0);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["activated_loras"], FACE_SWAP_LORAS.map((lora) => lora.name), true);
    setDiscoveredSetting(settings, schema, defaults, modelType, ["loras_multipliers"], FACE_SWAP_LORAS.map((lora) => `${lora.strength}`).join(" "), true);
  } else {
    applyLoraSettings(settings, schema, defaults, modelType, request.loras);
  }
  return settings;
}