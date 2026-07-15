import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { config } from "@/lib/config";
import type { WanGpClient, WanGpJobSnapshot, WanGpModelSummary } from "./client";

const fakeModels: WanGpModelSummary[] = [
  { modelType: "qwen_image_fixture", name: "Qwen Image", family: "qwen", output: "image", inputs: ["text"] },
  { modelType: "qwen_image_edit_fixture", name: "Qwen Image Edit", family: "qwen", output: "image", inputs: ["text", "image"] },
  { modelType: "flux_klein_9b_fixture", name: "Flux.2 Klein 9B", family: "flux", output: "image", inputs: ["text", "image"] },
  { modelType: "ltx2_fixture", name: "LTX-2 Distilled", family: "ltx2", output: "video", inputs: ["text", "image"], finetune: false },
];
const execFileAsync = promisify(execFile);

export class FakeWanGpClient implements WanGpClient {
  private readonly jobs = new Map<string, WanGpJobSnapshot & { createdAt: number; modelType: string; settings: Record<string, unknown> }>();
  private readonly submissions: { modelType: string; settings: Record<string, unknown> }[] = [];
  async ping() { return { connected: true, version: "fake-1.0" }; }
  async listModels(output?: "image" | "video") { return fakeModels.filter((model) => !output || model.output === output); }
  async getModelMetadata(modelType: string) { const model = this.requireModel(modelType); return { ...model, capabilities: model.output === "video" ? ["start-frame", "end-frame"] : [] }; }
  async getModelAvailability(modelType: string) { this.requireModel(modelType); return { status: "available" as const }; }
  async getDefaultSettings(modelType: string) { const model = this.requireModel(modelType); return model.output === "video" ? { resolution: "1280x720", durationSeconds: 5, fps: 24 } : { resolution: "1024x1024", count: 1, guidance_scale: model.family === "qwen" ? 4 : 5 }; }
  async getModelSchema(modelType: string) { const model = this.requireModel(modelType); return model.output === "video" ? { resolutions: ["1280x720", "720x1280"], supportsEndFrame: true } : { resolutions: ["1024x1024", "1344x768", "768x1344"], maxOutputs: 4 }; }
  async listLoras(modelType: string) {
    const model = this.requireModel(modelType);
    const loras = model.family === "ltx2" ? ["cinematic-motion.safetensors", "handheld-camera.sft"] : model.family === "flux" ? ["graphic-novel.safetensors", "soft-light.safetensors"] : ["editorial-style.safetensors", "product-photo.sft", "Qwen-Lightning-4steps.safetensors", "bfs_head_v5_2511_merged_version_rank_16_fp16.safetensors"];
    const accelerationPresets = modelType === "qwen_image_fixture" ? [{ id: "fixture-qwen-lightning", label: "Lightning Qwen - 4 Steps", modelTypes: [modelType], workflowTypes: ["image-create" as const], loras: [{ filename: "Qwen-Lightning-4steps.safetensors", multiplier: 1, required: true, role: "single" as const }], settings: { numInferenceSteps: 4, guidanceScale: 1, sampleSolver: "lightning" }, source: "mcp" as const, confidence: "authoritative" as const, evidence: [{ source: "mcp" as const, detail: "Fixture accelerator preset" }] }] : [];
    return { supported: true, loras, accelerationPresets };
  }
  async generate(modelType: string, settings: Record<string, unknown>) { this.requireModel(modelType); this.submissions.push({ modelType, settings: structuredClone(settings) }); const jobId = crypto.randomUUID(); this.jobs.set(jobId, { id: jobId, status: "queued", progressPercent: 0, statusMessage: "Queued by fake WanGP", createdAt: Date.now(), modelType, settings }); return { jobId }; }
  getLastSubmissionForTests() { return this.submissions.at(-1); }
  async getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("WanGP job was not found.");
    if (["cancelled", "failed", "completed"].includes(job.status)) return { ...job };
    const elapsed = Date.now() - job.createdAt;
    if (elapsed < 250) return { ...job };
    if (elapsed < 900) { Object.assign(job, { status: "running", progressPercent: 38, statusMessage: "Loading local model" }); return { ...job }; }
    if (elapsed < 1500) { Object.assign(job, { status: "running", progressPercent: 76, statusMessage: "Rendering output" }); return { ...job }; }
    const outputPath = await this.createFixtureOutput(job);
    Object.assign(job, { status: "completed", progressPercent: 100, statusMessage: "Completed", outputPaths: [outputPath] });
    return { ...job };
  }
  async cancelJob(jobId: string) { const job = await this.getJob(jobId); this.jobs.set(jobId, { ...job, status: "cancelled", statusMessage: "Cancelled" }); }
  private requireModel(modelType: string) { const model = fakeModels.find((candidate) => candidate.modelType === modelType); if (!model) throw new Error(`Unknown fixture model: ${modelType}`); return model; }
  private async createFixtureOutput(job: { id: string; modelType: string; settings: Record<string, unknown> }) {
    await fs.mkdir(config.WANGP_OUTPUT_ROOT, { recursive: true });
    if (this.requireModel(job.modelType).output === "video") {
      const videoPath = path.join(config.WANGP_OUTPUT_ROOT, `${job.id}.mp4`);
      try { await fs.access(videoPath); return videoPath; } catch {}
      await execFileAsync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x153f3b:s=1280x720:d=2", "-vf", "format=yuv420p", "-c:v", "libx264", "-movflags", "+faststart", "-y", videoPath]);
      return videoPath;
    }
    const outputPath = path.join(config.WANGP_OUTPUT_ROOT, `${job.id}.png`);
    try { await fs.access(outputPath); return outputPath; } catch {}
    const prompt = String(job.settings.prompt ?? "Generated locally").replace(/[<>&'\"]/g, " ").slice(0, 90);
    const svg = `<svg width="1344" height="768" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#153f3b"/><stop offset=".55" stop-color="#e34b2f"/><stop offset="1" stop-color="#edb52d"/></linearGradient></defs><rect width="1344" height="768" fill="url(#g)"/><circle cx="1080" cy="190" r="230" fill="#fff" opacity=".15"/><path d="M0 590 Q300 410 590 610 T1344 530 V768 H0Z" fill="#102d2b" opacity=".72"/><text x="72" y="650" fill="white" font-size="34" font-family="sans-serif" font-weight="600">${prompt}</text><text x="74" y="704" fill="white" opacity=".7" font-size="18" font-family="monospace">EASY MEDIA GENERATOR / FAKE WANGP OUTPUT</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    return outputPath;
  }
}