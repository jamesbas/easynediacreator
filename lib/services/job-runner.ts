import { config } from "@/lib/config";
import { getJob, updateJob } from "@/lib/runtime/job-registry";
import { registerOutput } from "@/lib/runtime/output-registry";
import { getWanGpClient } from "@/lib/wan-gp";
import { logger } from "@/lib/telemetry";

type QueueItem = { jobId: string; modelType: string; settings: Record<string, unknown> };
const state = globalThis as unknown as { easyMediaQueue?: QueueItem[]; easyMediaRunning?: number; easyMediaRecipes?: Map<string, QueueItem> };
function queue() { state.easyMediaQueue ??= []; state.easyMediaRunning ??= 0; return state.easyMediaQueue; }
function errorDetails(error: unknown) { return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { value: error }; }

export function enqueueJob(item: QueueItem) {
  if (queue().length >= config.MAX_QUEUED_JOBS) throw new Error("Job queue is full.");
  state.easyMediaRecipes ??= new Map();
  state.easyMediaRecipes.set(item.jobId, item);
  queue().push(item);
  logger.info({ event: "job.created", jobId: item.jobId }, "Generation job queued");
  void processQueue();
}

async function processQueue() {
  if ((state.easyMediaRunning ?? 0) >= config.MAX_ACTIVE_GENERATION_JOBS) return;
  const item = queue().shift();
  if (!item) return;
  const job = getJob(item.jobId);
  if (!job || job.status !== "queued") { void processQueue(); return; }
  state.easyMediaRunning = (state.easyMediaRunning ?? 0) + 1;
  try {
    const submission = await getWanGpClient().generate(item.modelType, item.settings);
    updateJob(job.id, { status: "running", wanGpJobId: submission.jobId, progressPercent: 1, statusMessage: "Submitted to WanGP" });
    logger.info({ event: "job.submitted", jobId: job.id, wanGpJobId: submission.jobId }, "Generation submitted");
    await poll(job.id, submission.jobId);
  } catch (error) {
    const current = getJob(job.id);
    if (current && !["cancelled", "completed"].includes(current.status)) updateJob(job.id, { status: "failed", statusMessage: "Generation failed", error: { message: error instanceof Error ? error.message : "WanGP generation failed." } });
    logger.error({ event: "job.failed", jobId: job.id, error: errorDetails(error) }, "Generation failed");
  } finally {
    state.easyMediaRunning = Math.max(0, (state.easyMediaRunning ?? 1) - 1);
    void processQueue();
  }
}

async function poll(jobId: string, wanGpJobId: string) {
  let consecutiveFailures = 0;
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, config.WANGP_CLIENT_MODE === "fake" ? 250 : 1500));
    const current = getJob(jobId);
    if (!current || current.status === "cancelled") return;
    let snapshot;
    try {
      snapshot = await getWanGpClient().getJob(wanGpJobId);
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      logger.warn({ event: "job.poll_failed", jobId, wanGpJobId, attempt: consecutiveFailures, error: errorDetails(error) }, "WanGP job poll failed");
      if (consecutiveFailures >= 3) throw error;
      continue;
    }
    if (snapshot.status === "queued" || snapshot.status === "running") {
      updateJob(jobId, { progressPercent: snapshot.progressPercent, statusMessage: snapshot.statusMessage });
      continue;
    }
    if (snapshot.status === "cancelled") { updateJob(jobId, { status: "cancelled", statusMessage: "Cancelled" }); return; }
    if (snapshot.status === "failed") { updateJob(jobId, { status: "failed", statusMessage: "Generation failed", error: { message: snapshot.error ?? "WanGP generation failed." } }); return; }
    const outputIds = (snapshot.outputPaths ?? []).map((outputPath) => registerOutput({ path: outputPath, workflowType: current.workflowType, modelKey: current.modelKey, prompt: current.prompt }).id);
    updateJob(jobId, { status: "completed", progressPercent: 100, statusMessage: "Completed", outputIds });
    logger.info({ event: "job.completed", jobId, outputCount: outputIds.length }, "Generation completed");
    return;
  }
}

export async function cancelRuntimeJob(jobId: string) {
  const job = getJob(jobId);
  if (!job) throw new Error("Job was not found.");
  if (job.status === "queued") { updateJob(jobId, { status: "cancelled", statusMessage: "Cancelled before submission" }); return; }
  if (job.status !== "running") throw new Error("Only active jobs can be cancelled.");
  updateJob(jobId, { status: "cancel_requested", statusMessage: "Cancellation requested" });
  if (job.wanGpJobId) await getWanGpClient().cancelJob(job.wanGpJobId);
  logger.info({ event: "job.cancel_requested", jobId }, "Generation cancellation requested");
}

export function retryRuntimeJob(jobId: string) {
  const job = getJob(jobId);
  const recipe = state.easyMediaRecipes?.get(jobId);
  if (!job || !recipe) throw new Error("Job cannot be retried after the app restarts.");
  if (!(["failed", "cancelled"] as const).includes(job.status as "failed" | "cancelled")) throw new Error("Only failed or cancelled jobs can be retried.");
  updateJob(jobId, { status: "queued", wanGpJobId: undefined, progressPercent: 0, statusMessage: "Waiting for GPU", error: undefined, outputIds: undefined });
  enqueueJob(recipe);
}

export function forgetRuntimeJobs(jobIds: string[]) {
  for (const jobId of jobIds) state.easyMediaRecipes?.delete(jobId);
}