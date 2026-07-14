import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_MODEL_SELECTIONS: Record<string, string> = {
  "image-edit:qwen-image-edit": "qwen_image_edit_plus2_20B",
  "video-create:ltx-2": "ltx2_22B_distilled_1_1",
};

const preferencesPath = path.join(process.cwd(), "data", "model-selections.json");

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