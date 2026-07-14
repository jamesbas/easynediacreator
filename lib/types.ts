export type WorkflowType = "image-create" | "image-edit" | "video-create";
export type JobStatus = "draft" | "queued" | "running" | "completed" | "failed" | "cancel_requested" | "cancelled";

export type RuntimeJob = {
  id: string;
  wanGpJobId?: string;
  workflowType: WorkflowType;
  modelKey: string;
  status: JobStatus;
  prompt: string;
  submittedAt: string;
  updatedAt: string;
  progressPercent?: number;
  statusMessage?: string;
  outputIds?: string[];
  error?: { message: string; code?: string };
};

export type ModelAvailability = "available" | "partial" | "missing";
export type LoraCatalog = { supported: boolean; loras: string[]; reason?: string };
export type ModelOption = {
  key: string;
  displayName: string;
  workflowType: WorkflowType;
  modelType?: string;
  availability: ModelAvailability;
  reason?: string;
  schema: Record<string, unknown>;
  defaults: Record<string, unknown>;
  capabilities: string[];
  loraCatalog: LoraCatalog;
};

export type RuntimeAsset = {
  id: string;
  type: "image" | "video";
  workflowType: WorkflowType;
  modelKey: string;
  prompt: string;
  createdAt: string;
  filename: string;
  path: string;
};