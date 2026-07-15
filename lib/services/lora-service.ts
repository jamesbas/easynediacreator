import type { LoraSelection } from "@/lib/requests";
import type { LoraCatalog } from "@/lib/types";
import type { LoraAccelerationPreset, WorkflowType } from "@/lib/types";
import { logger } from "@/lib/telemetry";
import { additionalPresetSettingKeys } from "@/lib/wan-gp/lora-classifier/preset-settings";

export function validateModelLoras(selected: LoraSelection[], catalog: LoraCatalog) {
  if (!selected.length) return [];
  if (!catalog.supported) throw new Error(catalog.reason ?? "LoRA discovery is not supported by the connected WanGP server.");
  const available = new Map(catalog.loras.map((name) => [name.toLocaleLowerCase(), name]));
  return selected.map((lora) => {
    const canonicalName = available.get(lora.name.toLocaleLowerCase());
    if (!canonicalName) throw new Error(`LoRA '${lora.name}' is not available for the selected model. Refresh models and choose a listed LoRA.`);
    return { ...lora, name: canonicalName };
  });
}

export function resolveLoraPreset(presetId: string | undefined, selectedLoras: LoraSelection[], catalog: LoraCatalog, modelType: string, workflowType: WorkflowType) {
  if (!presetId) return undefined;
  if (!catalog.supported) throw new Error(catalog.reason ?? "LoRA discovery is not supported by the connected WanGP server.");
  const preset = catalog.accelerationPresets?.find((candidate) => candidate.id === presetId);
  if (!preset) throw new Error("The acceleration preset is unavailable or stale. Refresh models and select it again.");
  if (!preset.modelTypes.includes(modelType) || !preset.workflowTypes.includes(workflowType)) throw new Error("The acceleration preset is not compatible with this model and workflow.");
  const available = new Set(catalog.loras.map((filename) => filename.toLocaleLowerCase()));
  if (preset.loras.some((lora) => lora.required && !available.has(lora.filename.toLocaleLowerCase()))) throw new Error("A required acceleration LoRA is no longer installed. Refresh models.");
  const accelerationFiles = new Set((catalog.accelerationPresets ?? []).flatMap((candidate) => candidate.loras.map((lora) => lora.filename.toLocaleLowerCase())));
  const conflicting = selectedLoras.find((lora) => accelerationFiles.has(lora.name.toLocaleLowerCase()));
  if (conflicting) throw new Error(`LoRA '${conflicting.name}' belongs to an acceleration preset and cannot also be selected manually.`);
  logger.info({ event: "lora.preset_resolved", presetId: preset.id, modelType, workflowType, source: preset.source, confidence: preset.confidence }, "Acceleration preset resolved");
  return preset;
}

export function applyLoraAccelerationPreset(settings: Record<string, unknown>, preset: LoraAccelerationPreset | undefined, selectedLoras: LoraSelection[] = []) {
  if (!preset) return settings;
  settings.activated_loras = [...preset.loras.map((lora) => lora.filename), ...selectedLoras.map((lora) => lora.name)];
  const rawMultipliers = preset.settings.additional?.loras_multipliers;
  const presetMultipliers = typeof rawMultipliers === "string" ? rawMultipliers : preset.loras.map((lora) => `${lora.multiplier}`).join(" ");
  settings.loras_multipliers = [presetMultipliers, selectedLoras.map((lora) => `${lora.strength}`).join(" ")].filter(Boolean).join(" ");
  if (preset.settings.numInferenceSteps !== undefined) settings.num_inference_steps = preset.settings.numInferenceSteps;
  if (preset.settings.guidanceScale !== undefined) settings.guidance_scale = preset.settings.guidanceScale;
  if (preset.settings.sampleSolver !== undefined) settings.sample_solver = preset.settings.sampleSolver;
  if (preset.settings.guidancePhases !== undefined) settings.guidance_phases = preset.settings.guidancePhases;
  if (preset.settings.switchThreshold !== undefined) settings.switch_threshold = preset.settings.switchThreshold;
  for (const key of additionalPresetSettingKeys) if (preset.settings.additional?.[key] !== undefined) settings[key] = preset.settings.additional[key];
  return settings;
}