import { z } from "zod";
import type { LoraCatalog } from "@/lib/types";

export const modelSummarySchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const output = source.output ?? source.main_output;
  const inputs = source.inputs ?? source.media_inputs ?? [];
  return {
    modelType: source.modelType ?? source.model_type,
    name: source.name ?? source.model_type,
    family: source.family ?? source.model_family,
    output: Array.isArray(output) ? output.find((item) => item === "image" || item === "video") : output,
    inputs: Array.isArray(inputs) ? inputs : Object.keys(inputs).filter((key) => Boolean((inputs as Record<string, unknown>)[key])),
    finetune: source.finetune,
    availability: source.availability && typeof source.availability === "object" && "status" in source.availability ? source.availability.status : source.availability,
  };
}, z.object({
  modelType: z.string().min(1),
  name: z.string().min(1),
  family: z.string().min(1),
  output: z.enum(["image", "video"]),
  inputs: z.array(z.string()).default([]),
  finetune: z.boolean().optional(),
  availability: z.enum(["available", "partial", "missing"]).optional(),
}));

export const modelListSchema = z.array(modelSummarySchema);
export const availabilitySchema = z.object({ status: z.enum(["available", "partial", "missing"]), reason: z.string().optional() });
const mcpJobSchema = z.object({
  job_id: z.string().min(1),
  done: z.boolean(),
  cancel_requested: z.boolean().default(false),
  events: z.array(z.object({ kind: z.string(), data: z.unknown().optional() })).default([]),
  result: z.object({
    success: z.boolean(), cancelled: z.boolean().default(false), generated_files: z.array(z.string()).default([]),
    errors: z.array(z.object({ message: z.string() })).default([]),
  }).nullable().default(null),
});

export function parseWanGpJobSnapshot(value: unknown) {
  const snapshot = mcpJobSchema.parse(value);
  const latestProgress = [...snapshot.events].reverse().find((event) => event.kind === "progress")?.data;
  const progressRecord = latestProgress && typeof latestProgress === "object" ? latestProgress as Record<string, unknown> : {};
  const latestStatus = [...snapshot.events].reverse().find((event) => event.kind === "status")?.data;
  const status = !snapshot.done ? (snapshot.cancel_requested ? "running" as const : snapshot.events.some((event) => event.kind === "started") ? "running" as const : "queued" as const)
    : snapshot.result?.cancelled ? "cancelled" as const : snapshot.result?.success ? "completed" as const : "failed" as const;
  return {
    id: snapshot.job_id,
    status,
    progressPercent: typeof progressRecord.progress === "number" ? progressRecord.progress : undefined,
    statusMessage: typeof latestStatus === "string" ? latestStatus : typeof progressRecord.status === "string" ? progressRecord.status : undefined,
    outputPaths: snapshot.result?.generated_files,
    error: snapshot.result?.errors[0]?.message,
  };
}

export function parseLoraCatalog(value: unknown) {
  const source = Array.isArray(value) ? value : value && typeof value === "object" && "loras" in value ? (value as { loras: unknown }).loras : [];
  const items = z.array(z.union([z.string(), z.object({ name: z.string().optional(), filename: z.string().optional() })])).parse(source);
  const loras = items.map((item) => typeof item === "string" ? item : item.name ?? item.filename ?? "").map((item) => item.trim()).filter((item) => item && !item.includes("/") && !item.includes("\\"));
  return [...new Set(loras)].sort((left, right) => left.localeCompare(right));
}

export function parseWanGpTextContent(content: { type: string; text?: string }[]) {
  const texts = content.filter((item) => item.type === "text" && item.text).map((item) => item.text as string);
  if (!texts.length) throw new Error("WanGP tool returned no structured data.");
  try {
    const values = texts.map((text) => JSON.parse(text));
    return values.length === 1 ? values[0] : values;
  } catch {
    throw new Error("WanGP tool returned invalid JSON.");
  }
}

export function parseWanGpStructuredContent(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    if (Object.keys(source).length === 1 && "result" in source) return source.result;
  }
  return value;
}

export function record(value: unknown) {
  return z.record(z.string(), z.unknown()).parse(value);
}

const nativePresetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  model_types: z.array(z.string()).optional(),
  modelTypes: z.array(z.string()).optional(),
  workflow_types: z.array(z.enum(["image-create", "image-edit", "video-create"])).optional(),
  workflowTypes: z.array(z.enum(["image-create", "image-edit", "video-create"])).optional(),
  loras: z.array(z.object({ filename: z.string().min(1), multiplier: z.union([z.string(), z.number()]).default(1), required: z.boolean().default(true), role: z.enum(["high-noise", "low-noise", "single"]).optional() })),
  settings: z.object({ num_inference_steps: z.number().optional(), numInferenceSteps: z.number().optional(), guidance_scale: z.number().optional(), guidanceScale: z.number().optional(), sample_solver: z.string().optional(), sampleSolver: z.string().optional(), guidance_phases: z.number().optional(), guidancePhases: z.number().optional(), switch_threshold: z.number().optional(), switchThreshold: z.number().optional(), additional: z.record(z.string(), z.unknown()).optional() }).default({}),
});

export function parseLoraCatalogResponse(value: unknown, modelType: string): LoraCatalog {
  if (Array.isArray(value)) return { supported: true, loras: parseLoraCatalog(value) };
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const loras = parseLoraCatalog(source);
  const presets = z.array(nativePresetSchema).default([]).parse(source.acceleration_presets ?? source.accelerationPresets ?? []);
  return {
    supported: source.supported !== false,
    loras,
    reason: typeof source.reason === "string" ? source.reason : undefined,
    accelerationPresets: presets.map((preset) => ({
      id: preset.id, label: preset.label, modelTypes: preset.model_types ?? preset.modelTypes ?? [modelType], workflowTypes: preset.workflow_types ?? preset.workflowTypes ?? [], loras: preset.loras,
      settings: { numInferenceSteps: preset.settings.num_inference_steps ?? preset.settings.numInferenceSteps, guidanceScale: preset.settings.guidance_scale ?? preset.settings.guidanceScale, sampleSolver: preset.settings.sample_solver ?? preset.settings.sampleSolver, guidancePhases: preset.settings.guidance_phases ?? preset.settings.guidancePhases, switchThreshold: preset.settings.switch_threshold ?? preset.settings.switchThreshold, additional: preset.settings.additional },
      source: "mcp", confidence: "authoritative", evidence: [{ source: "mcp", detail: "WanGP supplied typed acceleration preset" }],
    })),
  };
}