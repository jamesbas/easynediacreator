import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LoraAccelerationPreset, WorkflowType } from "@/lib/types";
import { additionalPresetSettingKeys } from "./preset-settings";

const profileSchema = z.object({
  model_type: z.string().optional(),
  activated_loras: z.array(z.string()).default([]),
  loras_multipliers: z.union([z.string(), z.number()]).optional(),
  num_inference_steps: z.number().int().positive().optional(),
  guidance_scale: z.number().optional(),
  sample_solver: z.string().optional(),
  guidance_phases: z.number().int().positive().optional(),
  switch_threshold: z.number().optional(),
}).passthrough();

const acceleratorNamePattern = /lightning|distilled?lora|lightx2v|lighx2v|causvid|fastwan|turbo alpha|fusioni?x|chrono edit distill/i;
const acceleratorSolverPattern = /distill|causvid|lightning|fast/i;

function basename(value: string) {
  const decoded = decodeURIComponent(value);
  const slash = Math.max(decoded.lastIndexOf("/"), decoded.lastIndexOf("\\"));
  return decoded.slice(slash + 1);
}

function profileLooksAccelerated(label: string, profile: z.infer<typeof profileSchema>) {
  if (!acceleratorNamePattern.test(label) && !acceleratorSolverPattern.test(profile.sample_solver ?? "")) return false;
  if (!profile.activated_loras.length) return false;
  return (profile.num_inference_steps ?? 999) <= 15 || profile.guidance_scale === 1 || acceleratorSolverPattern.test(profile.sample_solver ?? "");
}

function profileMatchesWorkflow(label: string, directoryName: string, modelType: string, workflowType: WorkflowType) {
  const normalized = `${label} ${directoryName}`.toLowerCase();
  if (directoryName === "qwen") return workflowType === "image-edit" ? normalized.includes("edit") : workflowType === "image-create" && !normalized.includes("edit");
  if (directoryName === "ltx2_dev_accelerators") return workflowType === "video-create" && !/distilled/i.test(modelType);
  if (directoryName.startsWith("ltx2")) return workflowType === "video-create";
  if (directoryName.startsWith("flux")) return workflowType.startsWith("image-") && /flux/i.test(modelType);
  if (directoryName.startsWith("wan")) return workflowType === "video-create" && /wan/i.test(modelType);
  return false;
}

function multiplierFor(index: number, count: number, value: string | number | undefined) {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return 1;
  const simple = value.trim().split(/\s+/);
  if (simple.length === count && simple.every((item) => Number.isFinite(Number(item)))) return Number(simple[index]);
  return "profile-controlled";
}

function role(filename: string) {
  if (/high(?:[_ -]?noise)?/i.test(filename)) return "high-noise" as const;
  if (/low(?:[_ -]?noise)?/i.test(filename)) return "low-noise" as const;
  return "single" as const;
}

async function profileFiles(root: string) {
  const files: string[] = [];
  async function visit(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const resolved = path.resolve(directory, entry.name);
      if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) return;
      if (entry.isDirectory()) await visit(resolved);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".json") files.push(resolved);
    }));
  }
  try { await visit(path.resolve(root)); } catch { return []; }
  return files.sort((left, right) => left.localeCompare(right));
}

export async function parseAccelerationProfiles(input: { profilesRoot?: string; installedLoras: string[]; modelType: string; workflowType: WorkflowType }) {
  if (!input.profilesRoot) return [];
  const installed = new Map(input.installedLoras.map((filename) => [filename.toLocaleLowerCase(), filename]));
  const presets: LoraAccelerationPreset[] = [];
  for (const file of await profileFiles(input.profilesRoot)) {
    try {
      const profile = profileSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
      const label = path.basename(file, path.extname(file));
      const directoryName = path.basename(path.dirname(file));
      if (!profileLooksAccelerated(label, profile) || !profileMatchesWorkflow(label, directoryName, input.modelType, input.workflowType)) continue;
      const filenames = profile.activated_loras.map(basename);
      const canonical = filenames.map((filename) => installed.get(filename.toLocaleLowerCase()));
      if (canonical.some((filename) => !filename)) continue;
      const idHash = crypto.createHash("sha256").update(`${directoryName}/${label}`).digest("hex").slice(0, 12);
      const rawMultipliers = profile.loras_multipliers;
      const additional = Object.fromEntries(additionalPresetSettingKeys.flatMap((key) => profile[key] === undefined ? [] : [[key, profile[key]]]));
      if (typeof rawMultipliers === "string") additional.loras_multipliers = rawMultipliers;
      presets.push({
        id: `profile-${idHash}`,
        label,
        modelTypes: [input.modelType],
        workflowTypes: [input.workflowType],
        loras: canonical.map((filename, index) => ({ filename: filename!, multiplier: multiplierFor(index, canonical.length, rawMultipliers), required: true, role: role(filename!) })),
        settings: {
          numInferenceSteps: profile.num_inference_steps,
          guidanceScale: profile.guidance_scale,
          sampleSolver: profile.sample_solver,
          guidancePhases: profile.guidance_phases,
          switchThreshold: profile.switch_threshold,
          additional: Object.keys(additional).length ? additional : undefined,
        },
        source: "wan-gp-profile",
        confidence: "high",
        evidence: [{ source: "wan-gp-profile", detail: `Exact installed LoRA match in '${label}'` }],
      });
    } catch {}
  }
  return presets.sort((left, right) => left.label.localeCompare(right.label));
}