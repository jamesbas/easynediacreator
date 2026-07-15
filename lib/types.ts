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
export type LoraPurpose = "accelerator" | "content" | "unclassified";
export type ClassificationConfidence = "authoritative" | "high" | "medium" | "low";
export type LoraClassificationEvidence = { source: "mcp" | "wan-gp-profile" | "lora-manager-metadata" | "safetensor-header" | "filename" | "user-override"; detail: string };
export type ClassifiedLora = { filename: string; purpose: LoraPurpose; confidence: ClassificationConfidence; compatible: boolean; reason?: string; evidence: LoraClassificationEvidence[] };
export type LoraAccelerationPreset = {
  id: string;
  label: string;
  modelTypes: string[];
  workflowTypes: WorkflowType[];
  loras: Array<{ filename: string; multiplier: string | number; required: boolean; role?: "high-noise" | "low-noise" | "single" }>;
  settings: { numInferenceSteps?: number; guidanceScale?: number; sampleSolver?: string; guidancePhases?: number; switchThreshold?: number; additional?: Record<string, unknown> };
  source: "mcp" | "wan-gp-profile" | "user-override";
  confidence: ClassificationConfidence;
  evidence: LoraClassificationEvidence[];
};
export type LoraCatalog = { supported: boolean; loras: string[]; items?: ClassifiedLora[]; accelerationPresets?: LoraAccelerationPreset[]; refreshedAt?: string; reason?: string };
export type ModelCandidate = { modelType: string; name: string; availability?: ModelAvailability };
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
  candidates: ModelCandidate[];
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