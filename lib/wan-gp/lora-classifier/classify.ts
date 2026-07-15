import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ClassifiedLora, ClassificationConfidence, LoraAccelerationPreset, LoraCatalog, LoraPurpose, WorkflowType } from "@/lib/types";
import { getLoraDirectoryName } from "../local-lora-catalog";
import { parseAccelerationProfiles } from "./profile-parser";

const strongPattern = /lightning|distill(?:ed|ation)?|lightx2v|lighx2v|causvid|fastwan|accelerator/i;
const supportingPattern = /lightning|distill(?:ed|ation)?|lightx2v|lighx2v|causvid|fastwan|cfg.{0,12}(?:1|one)|(?:3|4|6|8)[ -]?steps?/i;
const overrideEntrySchema = z.object({
  purpose: z.enum(["accelerator", "content", "unclassified"]),
  label: z.string().min(1).max(200).optional(),
  settings: z.object({ numInferenceSteps: z.number().int().positive().optional(), guidanceScale: z.number().optional(), sampleSolver: z.string().optional(), guidancePhases: z.number().int().positive().optional(), switchThreshold: z.number().optional(), multiplier: z.union([z.string(), z.number()]).optional() }).optional(),
});
const overridesSchema = z.record(z.string(), overrideEntrySchema);

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function cleanText(value: unknown) { return typeof value === "string" ? value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 20_000) : ""; }

async function metadataEvidence(metadataRoot: string | undefined, category: string | undefined, filename: string) {
  if (!metadataRoot || !category) return "";
  const directory = path.resolve(metadataRoot, category);
  if (path.dirname(directory) !== path.resolve(metadataRoot)) return "";
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const target = path.parse(filename).name.toLocaleLowerCase();
    const metadataFile = entries.find((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json" && path.parse(entry.name).name.toLocaleLowerCase() === target);
    if (!metadataFile) return "";
    const resolved = path.resolve(directory, metadataFile.name);
    const stat = await fs.stat(resolved);
    if (stat.size > 5_000_000) return "";
    const value = object(JSON.parse(await fs.readFile(resolved, "utf8")));
    const model = object(value.model);
    const trainedWords = Array.isArray(value.trainedWords) ? value.trainedWords.slice(0, 20).map(cleanText).join(" ") : "";
    return [cleanText(value.name), cleanText(value.description), cleanText(value.baseModel), cleanText(value.baseModelType), cleanText(model.name), trainedWords].join(" ");
  } catch { return ""; }
}

async function readOverrides(filePath?: string) {
  if (!filePath) return {} as z.infer<typeof overridesSchema>;
  try { return overridesSchema.parse(JSON.parse(await fs.readFile(filePath, "utf8"))); } catch { return {}; }
}

function overridePreset(key: string, filename: string, entry: z.infer<typeof overrideEntrySchema>, modelType: string, workflowType: WorkflowType): LoraAccelerationPreset | undefined {
  if (entry.purpose !== "accelerator" || !entry.settings) return undefined;
  const id = `override-${Buffer.from(key).toString("base64url").slice(0, 40)}`;
  return { id, label: entry.label ?? filename, modelTypes: [modelType], workflowTypes: [workflowType], loras: [{ filename, multiplier: entry.settings.multiplier ?? 1, required: true, role: "single" }], settings: { numInferenceSteps: entry.settings.numInferenceSteps, guidanceScale: entry.settings.guidanceScale, sampleSolver: entry.settings.sampleSolver, guidancePhases: entry.settings.guidancePhases, switchThreshold: entry.settings.switchThreshold }, source: "user-override", confidence: "authoritative", evidence: [{ source: "user-override", detail: `Private override '${key}'` }] };
}

export async function classifyLoraCatalog(input: { catalog: LoraCatalog; schema: Record<string, unknown>; metadata: Record<string, unknown>; modelType: string; workflowType: WorkflowType; profilesRoot?: string; metadataRoot?: string; overridesPath?: string }): Promise<LoraCatalog> {
  if (!input.catalog.supported) return input.catalog;
  const effectiveSchema = Object.keys(input.schema).length ? input.schema : { metadata: input.metadata, model_type: input.modelType };
  const category = getLoraDirectoryName(effectiveSchema);
  const overrides = await readOverrides(input.overridesPath);
  const nativePresets = (input.catalog.accelerationPresets ?? []).filter((preset) => (!preset.modelTypes.length || preset.modelTypes.includes(input.modelType)) && (!preset.workflowTypes.length || preset.workflowTypes.includes(input.workflowType))).map((preset) => ({ ...preset, modelTypes: preset.modelTypes.length ? preset.modelTypes : [input.modelType], workflowTypes: preset.workflowTypes.length ? preset.workflowTypes : [input.workflowType] }));
  const profilePresets = await parseAccelerationProfiles({ profilesRoot: input.profilesRoot, installedLoras: input.catalog.loras, modelType: input.modelType, workflowType: input.workflowType });
  const discoveredPresets = [...nativePresets, ...profilePresets];
  const presetFiles = new Map(discoveredPresets.flatMap((preset) => preset.loras.map((lora) => [lora.filename.toLocaleLowerCase(), preset] as const)));
  const overridePresets: LoraAccelerationPreset[] = [];
  const items: ClassifiedLora[] = [];

  for (const filename of input.catalog.loras) {
    const key = `${category ?? input.modelType}/${filename}`;
    const override = overrides[key];
    const preset = presetFiles.get(filename.toLocaleLowerCase());
    const metadataText = await metadataEvidence(input.metadataRoot, category, filename);
    let purpose: LoraPurpose = "unclassified";
    let confidence: ClassificationConfidence = "low";
    const evidence: ClassifiedLora["evidence"] = [];
    if (override) {
      purpose = override.purpose; confidence = "authoritative"; evidence.push({ source: "user-override", detail: `Private override '${key}'` });
      const created = overridePreset(key, filename, override, input.modelType, input.workflowType); if (created) overridePresets.push(created);
    } else if (preset) {
      purpose = "accelerator"; confidence = "high"; evidence.push(...preset.evidence);
    } else if (strongPattern.test(filename) && supportingPattern.test(metadataText)) {
      purpose = "accelerator"; confidence = "medium"; evidence.push({ source: "filename", detail: "Strong accelerator token in filename" }, { source: "lora-manager-metadata", detail: "Supporting accelerator language in local metadata" });
    } else if (strongPattern.test(filename)) {
      purpose = "accelerator"; confidence = "low"; evidence.push({ source: "filename", detail: "Possible accelerator token in filename; not promoted automatically" });
    }
    items.push({ filename, purpose, confidence, compatible: true, evidence });
  }
  return { ...input.catalog, items, accelerationPresets: [...discoveredPresets, ...overridePresets].sort((left, right) => left.label.localeCompare(right.label)), refreshedAt: new Date().toISOString() };
}

async function fingerprintPath(target: string | undefined) {
  if (!target) return "";
  try {
    const stat = await fs.stat(target);
    if (stat.isFile()) return `${target}:${stat.size}:${stat.mtimeMs}`;
    const entries: string[] = [];
    async function visit(directory: string) {
      for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
        const resolved = path.resolve(directory, entry.name);
        if (!resolved.startsWith(`${path.resolve(target!)}${path.sep}`)) continue;
        if (entry.isDirectory()) await visit(resolved);
        else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".json") { const itemStat = await fs.stat(resolved); entries.push(`${path.relative(target!, resolved)}:${itemStat.size}:${itemStat.mtimeMs}`); }
      }
    }
    await visit(path.resolve(target)); return entries.sort().join("|");
  } catch { return "unavailable"; }
}

export async function getClassifierFingerprint(profilesRoot?: string, metadataRoot?: string, overridesPath?: string) {
  return (await Promise.all([fingerprintPath(profilesRoot), fingerprintPath(metadataRoot), fingerprintPath(overridesPath)])).join(";");
}