import type { JobRequestSnapshot } from "@/lib/requests";
import type { JobStatus, RuntimeJob, WorkflowType } from "@/lib/types";

const transitions: Record<JobStatus, JobStatus[]> = {
  draft: ["queued"], queued: ["running", "cancel_requested", "cancelled", "failed"], running: ["completed", "failed", "cancel_requested", "cancelled"],
  cancel_requested: ["cancelled", "completed", "failed"], completed: [], failed: ["queued"], cancelled: ["queued"],
};

const globalJobs = globalThis as unknown as { easyMediaJobs?: Map<string, RuntimeJob> };
function store() { globalJobs.easyMediaJobs ??= new Map(); return globalJobs.easyMediaJobs; }

export function createJob(input: { workflowType: WorkflowType; modelKey: string; prompt: string; requestSnapshot: JobRequestSnapshot }) {
  const now = new Date().toISOString();
  const job: RuntimeJob = { id: crypto.randomUUID(), ...input, status: "queued", submittedAt: now, updatedAt: now, progressPercent: 0, statusMessage: "Waiting for GPU" };
  store().set(job.id, job);
  return job;
}

export function getJob(id: string) { return store().get(id); }
export function listJobs() { return [...store().values()].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)); }
export function clearFinishedJobs() {
  const removed: string[] = [];
  for (const [id, job] of store()) {
    if (["completed", "failed", "cancelled"].includes(job.status)) { store().delete(id); removed.push(id); }
  }
  return removed;
}
export function updateJob(id: string, patch: Partial<Omit<RuntimeJob, "id" | "status">> & { status?: JobStatus }) {
  const current = getJob(id);
  if (!current) throw new Error("Job was not found.");
  if (patch.status && patch.status !== current.status && !transitions[current.status].includes(patch.status)) throw new Error(`Invalid job transition: ${current.status} to ${patch.status}`);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  store().set(id, next);
  return next;
}

export function resetJobsForTests() { store().clear(); }