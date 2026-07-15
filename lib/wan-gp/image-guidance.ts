import type { ImageCreateRequest } from "@/lib/requests";

const GUIDANCE_ONE_PATTERN = /lightning|distill/i;

export function hasGuidanceOneMarker(...values: unknown[]) {
  return values.flatMap((value) => Array.isArray(value) ? value : [value]).some((value) => typeof value === "string" && GUIDANCE_ONE_PATTERN.test(value));
}

export function qwenImageGuidanceScale(request: ImageCreateRequest, defaults: Record<string, unknown>, modelType: string) {
  const requiresOne = hasGuidanceOneMarker(modelType, defaults.type, defaults.sample_solver, defaults.activated_loras, request.loras.map((lora) => lora.name));
  return requiresOne ? 1 : request.guidanceScale;
}