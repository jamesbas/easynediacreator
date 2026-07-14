import type { LoraCatalog, ModelAvailability } from "@/lib/types";

export type WanGpModelSummary = { modelType: string; name: string; family: string; output: "image" | "video"; inputs: string[]; finetune?: boolean; availability?: ModelAvailability };
export type WanGpJobSnapshot = { id: string; status: "queued" | "running" | "completed" | "failed" | "cancelled"; progressPercent?: number; statusMessage?: string; outputPaths?: string[]; error?: string };

export interface WanGpClient {
  ping(): Promise<{ connected: boolean; version?: string }>;
  listModels(output?: "image" | "video"): Promise<WanGpModelSummary[]>;
  getModelMetadata(modelType: string): Promise<Record<string, unknown>>;
  getModelAvailability(modelType: string): Promise<{ status: ModelAvailability; reason?: string }>;
  getDefaultSettings(modelType: string): Promise<Record<string, unknown>>;
  getModelSchema(modelType: string): Promise<Record<string, unknown>>;
  listLoras(modelType: string): Promise<LoraCatalog>;
  generate(modelType: string, settings: Record<string, unknown>): Promise<{ jobId: string }>;
  getJob(jobId: string): Promise<WanGpJobSnapshot>;
  cancelJob(jobId: string): Promise<void>;
}