import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyLoraCatalog, getClassifierFingerprint } from "@/lib/wan-gp/lora-classifier/classify";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));
async function temp() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "lora-classifier-")); roots.push(root); return root; }

describe("LoRA classifier", () => {
  it("promotes profile matches, keeps filename-only matches uncertain, and applies overrides", async () => {
    const root = await temp(); const profilesRoot = path.join(root, "profiles"); const metadataRoot = path.join(root, "metadata"); const overridesPath = path.join(root, "overrides.json");
    await fs.mkdir(path.join(profilesRoot, "qwen"), { recursive: true }); await fs.mkdir(path.join(metadataRoot, "qwen"), { recursive: true });
    await fs.writeFile(path.join(profilesRoot, "qwen", "Lightning Qwen - 4 Steps.json"), JSON.stringify({ activated_loras: ["known-lightning.safetensors"], num_inference_steps: 4, guidance_scale: 1 }));
    await fs.writeFile(path.join(metadataRoot, "qwen", "possible-distilled.json"), JSON.stringify({ description: "Distilled inference in 8 steps" }));
    await fs.writeFile(overridesPath, JSON.stringify({ "qwen/content.safetensors": { purpose: "content" } }));
    const catalog = await classifyLoraCatalog({ catalog: { supported: true, loras: ["known-lightning.safetensors", "possible-distilled.safetensors", "filename-lightning.safetensors", "content.safetensors"] }, schema: { metadata: { family: "qwen", base_model_type: "qwen_image_20B" } }, metadata: {}, modelType: "qwen_image_20B", workflowType: "image-create", profilesRoot, metadataRoot, overridesPath });
    expect(catalog.accelerationPresets).toHaveLength(1);
    expect(catalog.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ filename: "known-lightning.safetensors", purpose: "accelerator", confidence: "high" }),
      expect.objectContaining({ filename: "possible-distilled.safetensors", purpose: "accelerator", confidence: "medium" }),
      expect.objectContaining({ filename: "filename-lightning.safetensors", purpose: "accelerator", confidence: "low" }),
      expect.objectContaining({ filename: "content.safetensors", purpose: "content", confidence: "authoritative" }),
    ]));
  });

  it("changes its fingerprint when profiles change", async () => {
    const root = await temp(); const profilesRoot = path.join(root, "profiles"); await fs.mkdir(profilesRoot);
    const before = await getClassifierFingerprint(profilesRoot);
    await fs.writeFile(path.join(profilesRoot, "preset.json"), "{}");
    expect(await getClassifierFingerprint(profilesRoot)).not.toBe(before);
  });

  it("fills omitted native compatibility and creates authoritative override recipes", async () => {
    const root = await temp(); const overridesPath = path.join(root, "overrides.json");
    await fs.writeFile(overridesPath, JSON.stringify({ "qwen/custom-fast.safetensors": { purpose: "accelerator", label: "Custom Fast", settings: { numInferenceSteps: 6, guidanceScale: 1 } } }));
    const nativePreset = { id: "native", label: "Native", modelTypes: ["qwen_image_20B"], workflowTypes: [], loras: [{ filename: "native.safetensors", multiplier: 1, required: true, role: "single" as const }], settings: { guidanceScale: 1 }, source: "mcp" as const, confidence: "authoritative" as const, evidence: [{ source: "mcp" as const, detail: "fixture" }] };
    const catalog = await classifyLoraCatalog({ catalog: { supported: true, loras: ["native.safetensors", "custom-fast.safetensors"], accelerationPresets: [nativePreset] }, schema: { metadata: { family: "qwen", base_model_type: "qwen_image_20B" } }, metadata: {}, modelType: "qwen_image_20B", workflowType: "image-create", overridesPath });
    expect(catalog.accelerationPresets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "native", workflowTypes: ["image-create"] }),
      expect.objectContaining({ label: "Custom Fast", source: "user-override", confidence: "authoritative", settings: { numInferenceSteps: 6, guidanceScale: 1 } }),
    ]));
  });
});