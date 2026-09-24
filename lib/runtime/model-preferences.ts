import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import type { WorkflowType } from "@/lib/types";

export const DEFAULT_MODEL_SELECTIONS: Record<string, string> = {
  "image-edit:qwen-image-edit": "qwen_image_edit_plus2_20B",
  "video-create:ltx-2": "ltx2_22B_distilled_1_1",
};

const preferencesPath = path.join(config.DATA_ROOT, "model-selections.json");
const visibilityPath = path.join(config.DATA_ROOT, "model-visibility.json");

export type ModelVisibility = Partial<Record<WorkflowType, string[]>>;

export async function getModelSelections() {
  try {
    const saved = JSON.parse(await fs.readFile(preferencesPath, "utf8"));
    return saved && typeof saved === "object" && !Array.isArray(saved)
      ? { ...DEFAULT_MODEL_SELECTIONS, ...saved as Record<string, string> }
      : { ...DEFAULT_MODEL_SELECTIONS };
  } catch {
    return { ...DEFAULT_MODEL_SELECTIONS };
  }
}

export async function setModelSelection(selectionKey: string, modelType: string) {
  const selections = await getModelSelections();
  selections[selectionKey] = modelType;
  await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
  await fs.writeFile(preferencesPath, `${JSON.stringify(selections, null, 2)}\n`, "utf8");
  return selections;
}

export async function getModelVisibility(): Promise<ModelVisibility> {
  try {
    const saved = JSON.parse(await fs.readFile(visibilityPath, "utf8"));
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter((entry): entry is [WorkflowType, string[]] =>
      ["image-create", "image-edit", "video-create"].includes(entry[0])
      && Array.isArray(entry[1])
      && entry[1].every((value) => typeof value === "string"),
    ));
  } catch {
    return {};
  }
}

export async function setModelVisibility(workflowType: WorkflowType, modelTypes: string[]) {
  const visibility = await getModelVisibility();
  visibility[workflowType] = [...new Set(modelTypes)];
  await fs.mkdir(path.dirname(visibilityPath), { recursive: true });
  const temporaryPath = `${visibilityPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(visibility, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, visibilityPath);
  return visibility;
}