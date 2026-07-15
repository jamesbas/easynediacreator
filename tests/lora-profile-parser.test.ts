import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAccelerationProfiles } from "@/lib/wan-gp/lora-classifier/profile-parser";

const roots: string[] = [];
async function root() { const value = await fs.mkdtemp(path.join(os.tmpdir(), "lora-profiles-")); roots.push(value); return value; }
async function profile(rootPath: string, directory: string, name: string, value: object) { await fs.mkdir(path.join(rootPath, directory), { recursive: true }); await fs.writeFile(path.join(rootPath, directory, `${name}.json`), JSON.stringify(value)); }
afterEach(async () => Promise.all(roots.splice(0).map((value) => fs.rm(value, { recursive: true, force: true }))));

describe("WanGP acceleration profile parser", () => {
  it("parses a Qwen Lightning recipe and excludes Qwen Edit from image creation", async () => {
    const profilesRoot = await root();
    await profile(profilesRoot, "qwen", "Lightning Qwen 2512 - 4 Steps", { activated_loras: ["https://example.test/Qwen-Lightning.safetensors"], loras_multipliers: "1", num_inference_steps: 4, guidance_scale: 1 });
    await profile(profilesRoot, "qwen", "Lightning Qwen Edit - 4 Steps", { activated_loras: ["Qwen-Edit-Lightning.safetensors"], num_inference_steps: 4, guidance_scale: 1 });
    const presets = await parseAccelerationProfiles({ profilesRoot, installedLoras: ["Qwen-Lightning.safetensors", "Qwen-Edit-Lightning.safetensors"], modelType: "qwen_image_2512_20B", workflowType: "image-create" });
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({ label: "Lightning Qwen 2512 - 4 Steps", settings: { numInferenceSteps: 4, guidanceScale: 1 }, loras: [{ filename: "Qwen-Lightning.safetensors", multiplier: 1 }] });
  });

  it("preserves paired Wan multipliers and roles", async () => {
    const profilesRoot = await root();
    await profile(profilesRoot, "wan_2_2", "Lightning t2v - 4 Steps", { activated_loras: ["HIGH_lightning.safetensors", "LOW_lightning.safetensors"], loras_multipliers: "1;0 0;1", num_inference_steps: 4, guidance_scale: 1, guidance2_scale: 1, guidance_phases: 2, model_switch_phase: 1, flow_shift: 3 });
    const presets = await parseAccelerationProfiles({ profilesRoot, installedLoras: ["HIGH_lightning.safetensors", "LOW_lightning.safetensors"], modelType: "wan_2_2", workflowType: "video-create" });
    expect(presets[0]).toMatchObject({ loras: [{ role: "high-noise" }, { role: "low-noise" }], settings: { guidancePhases: 2, additional: { loras_multipliers: "1;0 0;1", guidance2_scale: 1, model_switch_phase: 1, flow_shift: 3 } } });
  });

  it("parses a compatible LTX Dev distilled recipe and excludes ordinary profiles", async () => {
    const profilesRoot = await root();
    await profile(profilesRoot, "ltx2_dev_accelerators", "Single-Stage Dev DistilledLoRA (8 Steps)", { activated_loras: ["ltx-distilled.safetensors"], loras_multipliers: "0.5", num_inference_steps: 8, guidance_scale: 1, sample_solver: "distilled_8_steps" });
    await profile(profilesRoot, "ltx2_presets", "Video Reasoning", { activated_loras: ["reasoning.safetensors"] });
    const presets = await parseAccelerationProfiles({ profilesRoot, installedLoras: ["ltx-distilled.safetensors", "reasoning.safetensors"], modelType: "ltx2_22B", workflowType: "video-create" });
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({ settings: { sampleSolver: "distilled_8_steps" }, loras: [{ multiplier: 0.5 }] });
  });
});