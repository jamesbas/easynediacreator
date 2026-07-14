import path from "node:path";
import { config } from "@/lib/config";
import type { RuntimeAsset, WorkflowType } from "@/lib/types";
import { assertPathInsideRoot } from "@/lib/security/path-policy";

const globalOutputs = globalThis as unknown as { easyMediaOutputs?: Map<string, RuntimeAsset> };
function store() { globalOutputs.easyMediaOutputs ??= new Map(); return globalOutputs.easyMediaOutputs; }

export function registerOutput(input: { path: string; workflowType: WorkflowType; modelKey: string; prompt: string }) {
  const safePath = assertPathInsideRoot(input.path, config.WANGP_OUTPUT_ROOT);
  const extension = path.extname(safePath).toLowerCase();
  const asset: RuntimeAsset = { id: crypto.randomUUID(), type: [".mp4", ".webm", ".mov"].includes(extension) ? "video" : "image", ...input, path: safePath, filename: path.basename(safePath), createdAt: new Date().toISOString() };
  store().set(asset.id, asset);
  return asset;
}

export function getOutput(id: string) { return store().get(id); }
export function listOutputs() { return [...store().values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export function removeOutput(id: string) { return store().delete(id); }
export function clearOutputs() { const count = store().size; store().clear(); return count; }
export function publicAsset(asset: RuntimeAsset) { const { path: _path, ...safe } = asset; void _path; return { ...safe, contentUrl: `/api/assets/${asset.id}/content` }; }
export function resetOutputsForTests() { store().clear(); }