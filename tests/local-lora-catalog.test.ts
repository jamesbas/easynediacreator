import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getLocalLoraFingerprint, getLoraDirectoryName, listLocalLoras } from "@/lib/wan-gp/local-lora-catalog";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

describe("external WanGP LoRA catalog", () => {
  it("maps the supported model families to WanGP's default LoRA folders", () => {
    expect(getLoraDirectoryName({ metadata: { family: "qwen", base_model_type: "qwen_image_20B" } })).toBe("qwen");
    expect(getLoraDirectoryName({ metadata: { family: "flux", base_model_type: "flux2_klein_9b" } })).toBe("flux2_klein_9b");
    expect(getLoraDirectoryName({ metadata: { family: "flux2", base_model_type: "flux2_klein_9b" } })).toBe("flux2_klein_9b");
    expect(getLoraDirectoryName({ metadata: { family: "ltx2", base_model_type: "ltx2_22B" } })).toBe("ltx2");
  });

  it("returns only immediate supported filenames from the model-aligned directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "easy-media-loras-")); roots.push(root);
    await fs.mkdir(path.join(root, "ltx2"));
    await fs.writeFile(path.join(root, "ltx2", "cinematic.safetensors"), "fixture");
    await fs.writeFile(path.join(root, "ltx2", "motion.SFT"), "fixture");
    await fs.writeFile(path.join(root, "ltx2", "notes.txt"), "fixture");
    await fs.mkdir(path.join(root, "ltx2", "nested"));
    await fs.writeFile(path.join(root, "ltx2", "nested", "hidden.safetensors"), "fixture");
    await expect(listLocalLoras(root, { metadata: { family: "ltx2", base_model_type: "ltx2_22B" }, model_def: {} })).resolves.toEqual({ supported: true, loras: ["cinematic.safetensors", "motion.SFT"] });
  });

  it("changes its cache fingerprint when a model-aligned LoRA is added", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "easy-media-loras-")); roots.push(root);
    await fs.mkdir(path.join(root, "flux2_klein_9b"));
    const before = await getLocalLoraFingerprint(root);
    await fs.writeFile(path.join(root, "flux2_klein_9b", "pose.safetensors"), "fixture");
    const after = await getLocalLoraFingerprint(root);
    expect(after).not.toBe(before);
    expect(after).toContain("flux2_klein_9b:pose.safetensors");
  });

  it("honors WanGP's no_lora model flag", async () => {
    await expect(listLocalLoras("C:\\unused", { metadata: { family: "qwen" }, model_def: { no_lora: true } })).resolves.toMatchObject({ supported: false, loras: [] });
  });

  it("honors compact metadata that disables LoRAs", async () => {
    await expect(listLocalLoras("C:\\unused", { metadata: { family: "qwen", capabilities: { lora: false } } })).resolves.toMatchObject({ supported: false, loras: [] });
  });
});