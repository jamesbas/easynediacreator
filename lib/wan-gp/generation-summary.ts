import type { GenerationSummary } from "@/lib/types";

function firstString(settings: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstNumber(settings: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = settings[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function multiplierTokens(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => `${entry}`);
  return typeof value === "string" ? value.trim().split(/\s+/).filter(Boolean) : [];
}

/** Reads the WanGP settings that were actually submitted, so preset-applied steps and LoRAs are reflected. */
export function summarizeGenerationSettings(modelLabel: string, settings: Record<string, unknown>): GenerationSummary {
  const names = Array.isArray(settings.activated_loras) ? settings.activated_loras.filter((name): name is string => typeof name === "string" && name.trim().length > 0) : [];
  const multipliers = multiplierTokens(settings.loras_multipliers);
  return {
    modelLabel,
    resolution: firstString(settings, ["resolution", "size"]),
    steps: firstNumber(settings, ["num_inference_steps", "steps"]),
    loras: names.map((name, index) => ({ name, strength: multipliers[index] ?? "1" })),
  };
}
