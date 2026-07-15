import fs from "node:fs/promises";
import path from "node:path";
import type { LoraCatalog } from "@/lib/types";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isLoraFilename(name: string) {
  return [".safetensors", ".sft"].includes(path.extname(name).toLowerCase());
}

export async function getLocalLoraFingerprint(loraRoot?: string) {
  if (!loraRoot) return undefined;
  try {
    const rootEntries = await fs.readdir(path.resolve(loraRoot), { withFileTypes: true });
    const directories = rootEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
    const catalogs = await Promise.all(directories.map(async (directoryName) => {
      const entries = await fs.readdir(path.join(loraRoot, directoryName), { withFileTypes: true });
      const filenames = entries.filter((entry) => entry.isFile() && isLoraFilename(entry.name)).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
      return `${directoryName}:${filenames.join("|")}`;
    }));
    return catalogs.join(";");
  } catch {
    return "unavailable";
  }
}

export function getLoraDirectoryName(schema: Record<string, unknown>) {
  const modelDef = object(schema.model_def);
  const metadata = object(schema.metadata);
  const capabilities = object(metadata.capabilities);
  if (modelDef.no_lora === true || capabilities.lora === false) return undefined;
  const family = String(metadata.family ?? modelDef.family ?? "").toLowerCase();
  const baseModelType = String(metadata.base_model_type ?? modelDef.base_model_type ?? schema.model_type ?? "").toLowerCase();
  if (family === "qwen") return "qwen";
  if (family === "ltx2") return "ltx2";
  if (family === "flux" || family === "flux2") {
    if (baseModelType.includes("flux2_klein_9b")) return "flux2_klein_9b";
    if (baseModelType.includes("flux2_klein_4b")) return "flux2_klein_4b";
    return baseModelType.includes("flux2") ? "flux2" : "flux";
  }
  return undefined;
}

export async function listLocalLoras(loraRoot: string, schema: Record<string, unknown>): Promise<LoraCatalog> {
  const modelDef = object(schema.model_def);
  const metadata = object(schema.metadata);
  const capabilities = object(metadata.capabilities);
  if (modelDef.no_lora === true || capabilities.lora === false) return { supported: false, loras: [], reason: "This WanGP model does not support LoRAs." };
  const directoryName = getLoraDirectoryName(schema);
  if (!directoryName) return { supported: false, loras: [], reason: "No external LoRA directory mapping is available for this WanGP model family." };
  const root = path.resolve(loraRoot);
  const directory = path.resolve(root, directoryName);
  if (path.dirname(directory) !== root) return { supported: false, loras: [], reason: "The resolved LoRA directory is outside the configured root." };
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const loras = entries
      .filter((entry) => entry.isFile() && isLoraFilename(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
    return { supported: true, loras };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return { supported: true, loras: [] };
    return { supported: false, loras: [], reason: "The configured WanGP LoRA directory could not be read." };
  }
}