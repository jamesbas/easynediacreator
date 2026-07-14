"use client";

import { Ban, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { RuntimeJob } from "@/lib/types";

export function JobsList() {
  const [jobs, setJobs] = useState<RuntimeJob[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = async () => { try { const response = await fetch("/api/jobs", { cache: "no-store" }); const data = await response.json(); if (active) setJobs(data.jobs ?? []); } catch { if (active) setError("Jobs could not be loaded."); } };
    void load(); const timer = window.setInterval(load, 1200); return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (error) return <p role="alert" className="text-[var(--accent)]">{error}</p>;
  if (!jobs.length) return <div className="border border-dashed border-[#aeb5ac] bg-[var(--surface)] p-12 text-center text-[var(--muted)]">The GPU queue is clear.</div>;
  const hasFinished = jobs.some((job) => ["completed", "failed", "cancelled"].includes(job.status));
  return <div className="space-y-3">{hasFinished && <div className="flex justify-end"><button type="button" onClick={async () => { const response = await fetch("/api/jobs", { method: "DELETE" }); const data = await response.json(); if (response.ok) setJobs(data.jobs ?? []); else setError(data.error ?? "Finished jobs could not be cleared."); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] px-3 text-sm font-bold hover:bg-[#f7e1dc]"><Trash2 size={15} />Clear finished</button></div>}{jobs.map((job) => <article key={job.id} className="border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5"><div className="flex items-start gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Status status={job.status} /><span className="font-mono text-xs text-[var(--muted)]">{job.workflowType.replaceAll("-", " ")}</span><span className="text-xs text-[var(--muted)]">{job.modelKey}</span><time className="text-xs text-[var(--muted)]">{new Date(job.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p className="mt-3 truncate font-semibold">{job.prompt}</p><p className="mt-1 text-sm text-[var(--muted)]">{job.statusMessage}</p></div>{["queued", "running"].includes(job.status) && <button title="Cancel job" aria-label="Cancel job" className="grid size-10 shrink-0 place-items-center rounded-md border border-[var(--line)] hover:bg-[#f7e1dc]" onClick={() => fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" })}><Ban size={17} /></button>}</div>{["queued", "running", "cancel_requested"].includes(job.status) && <div className="mt-4 h-2 overflow-hidden bg-[#e3e4de]"><div className="h-full bg-[var(--teal)] transition-[width]" style={{ width: `${job.progressPercent ?? 0}%` }} /></div>}{job.error && <details className="mt-3 text-sm text-[var(--accent)]"><summary className="cursor-pointer font-bold">Error details</summary><p className="mt-2">{job.error.message}</p></details>}{["failed", "cancelled"].includes(job.status) && <button onClick={() => fetch(`/api/jobs/${job.id}/retry`, { method: "POST" })} className="mt-3 inline-flex items-center gap-2 text-sm font-bold"><RotateCw size={15} />Retry</button>}</article>)}</div>;
}

function Status({ status }: { status: RuntimeJob["status"] }) { const terminal = status === "completed" ? "bg-[#dcece8] text-[var(--teal)]" : status === "failed" || status === "cancelled" ? "bg-[#f7e1dc] text-[var(--accent)]" : "bg-[#f3e8c7] text-[#7d5a00]"; return <span className={`rounded-sm px-2 py-1 font-mono text-[0.65rem] font-semibold uppercase ${terminal}`}>{status.replace("_", " ")}</span>; }