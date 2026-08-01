import type { ImageCreateRequest } from "@/lib/requests";

const GUIDANCE_ONE_PATTERN = /lightning|distill/i;
const KREA2_DISTILLED_PATTERN = /turbo/i;

export function hasGuidanceOneMarker(...values: unknown[]) {
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).some((value) => typeof value === "string" && GUIDANCE_ONE_PATTERN.test(value));
}

export function qwenImageGuidanceScale(request: ImageCreateRequest, defaults: Record<string, unknown>, modelType: string) {
  const requiresOne = hasGuidanceOneMarker(modelType, defaults.type, defaults.sample_solver, defaults.activated_loras, request.loras.map((lora) => lora.name));
  return requiresOne ? 1 : request.guidanceScale;
}

/**
 * The guidance a model refuses to have overridden, or undefined when the user
 * is free to choose. Krea 2 Turbo is step-distilled and WanGP reports
 * `guidance_max_phases: 0` for it, so any CFG above zero is discarded.
 */
export function lockedGuidanceScale(modelKey: string, ...values: unknown[]) {
  if (modelKey === "krea-2" || modelKey === "krea-2-edit") return hasKrea2DistilledMarker(...values) ? 0 : undefined;
  if (modelKey === "qwen-image" || modelKey === "qwen-image-edit") return hasGuidanceOneMarker(...values) ? 1 : undefined;
  return undefined;
}

export function hasKrea2DistilledMarker(...values: unknown[]) {
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).some((value) => typeof value === "string" && KREA2_DISTILLED_PATTERN.test(value));
}