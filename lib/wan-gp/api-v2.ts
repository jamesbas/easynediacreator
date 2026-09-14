import fs from "node:fs/promises";
import path from "node:path";
import type { WanGpJobSnapshot } from "./client";

/** WanGP 1.30 serves MCP API v2: nine toolboxes with deferred action contracts. */
export const V2_TOOLS = ["wangp_models", "wangp_model", "wangp_generate", "wangp_session"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

/** v2 reports media roles as name arrays; the app reads WanGP's older nested booleans. */
export function normalizeV2MediaInputs(mediaInputs: unknown) {
  if (!isRecord(mediaInputs)) return mediaInputs;
  return Object.fromEntries(Object.entries(mediaInputs).map(([kind, roles]) => [
    kind,
    Array.isArray(roles) ? Object.fromEntries(roles.filter((role): role is string => typeof role === "string").map((role) => [role, true])) : roles,
  ]));
}

export function normalizeV2Metadata(metadata: unknown) {
  if (!isRecord(metadata)) return {};
  return metadata.media_inputs === undefined ? { ...metadata } : { ...metadata, media_inputs: normalizeV2MediaInputs(metadata.media_inputs) };
}

export function normalizeV2ModelRecord(model: unknown) {
  if (!isRecord(model)) return model;
  return normalizeV2Metadata(model);
}

/** A `URLs` entry is either a download URL or another model_type whose files back this one. */
export function checkpointEntries(definition: Record<string, unknown>) {
  return toArray(definition.URLs).filter((entry): entry is string => typeof entry === "string");
}

export function checkpointBasename(entry: string) {
  return entry.split("|")[0].split(/[\\/]/).pop() ?? "";
}

export function isCheckpointFile(entry: string) {
  return /^https?:/i.test(entry) || checkpointBasename(entry).includes(".");
}

export type CheckpointIndex = { has(basename: string): boolean; size: number };

/** WanGP keeps downloaded weights under `ckpts`; any quantization variant counts as installed. */
export async function loadCheckpointIndex(ckptsRoot: string): Promise<CheckpointIndex | undefined> {
  const names = new Set<string>();
  const walk = async (directory: string, depth: number) => {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.isDirectory()) { if (depth < 2) await walk(path.join(directory, entry.name), depth + 1); }
      else names.add(entry.name.toLowerCase());
    }
  };
  await walk(ckptsRoot, 0);
  if (!names.size) return undefined;
  return { has: (basename: string) => names.has(basename.toLowerCase()), size: names.size };
}

/** A bounded `wait` can return before the render finishes; the job keeps running. */
export function isTerminalGenerationResult(value: unknown) {
  if (!isRecord(value)) return true;
  if (value.done === false) return false;
  const result = isRecord(value.result) ? value.result : undefined;
  if (result && (typeof result.success === "boolean" || result.cancelled === true)) return true;
  if (Array.isArray(value.generated_files)) return true;
  return value.done === true;
}

export function parseV2TerminalResult(value: unknown, fallbackId: string): WanGpJobSnapshot {
  const source = isRecord(value) ? value : {};
  const result = isRecord(source.result) ? source.result : source;
  const outputPaths = toArray(result.generated_files ?? source.generated_files).filter((item): item is string => typeof item === "string");
  const errors = toArray(result.errors).map((item) => (isRecord(item) && typeof item.message === "string" ? item.message : "")).filter(Boolean);
  const cancelled = result.cancelled === true;
  const success = result.success === true || (outputPaths.length > 0 && errors.length === 0);
  const id = typeof source.job_id === "string" && source.job_id ? source.job_id : fallbackId;
  return {
    id,
    status: cancelled ? "cancelled" : success ? "completed" : "failed",
    progressPercent: 100,
    statusMessage: cancelled ? "Cancelled" : success ? "Completed" : "Generation failed",
    outputPaths,
    error: success || cancelled ? undefined : errors[0] ?? "WanGP generation failed.",
  };
}

/** v2 advertises `wait` as a constant when the server was started without `--mcp-async`. */
export function asyncGenerationAllowed(contract: unknown) {
  const action = isRecord(contract) && isRecord(contract.action) ? contract.action : undefined;
  const parameters = action && isRecord(action.parameters) ? action.parameters : undefined;
  const properties = parameters && isRecord(parameters.properties) ? parameters.properties : undefined;
  const wait = properties && isRecord(properties.wait) ? properties.wait : undefined;
  if (!wait) return true;
  if (wait.const === true) return false;
  return !(Array.isArray(wait.enum) && wait.enum.length === 1 && wait.enum[0] === true);
}
