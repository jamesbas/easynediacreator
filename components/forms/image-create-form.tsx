"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_NEGATIVE_PROMPT } from "@/lib/requests";
import type { LoraCatalog } from "@/lib/types";
import { LoraSelector, readLoraSelections } from "./lora-selector";

type FormModel = { key: string; displayName: string; availability: string; reason?: string; resolutions: string[]; defaultResolution: string; loraCatalog: LoraCatalog };

export function ImageCreateForm({ models, defaultModel }: { models: FormModel[]; defaultModel: string }) {
  const router = useRouter();
  const [modelKey, setModelKey] = useState(models.find((model) => model.key === defaultModel && model.availability === "available")?.key ?? models.find((model) => model.availability === "available")?.key ?? "");
  const selected = models.find((model) => model.key === modelKey);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={async (event) => {
      event.preventDefault(); setError(""); setSubmitting(true);
      const data = new FormData(event.currentTarget);
      const response = await fetch("/api/jobs/image-create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: data.get("prompt"), negativePrompt: data.get("negativePrompt"), modelKey, resolution: data.get("resolution") || undefined, count: Number(data.get("count")), steps: Number(data.get("steps")), seed: data.get("seed") ? Number(data.get("seed")) : undefined, loras: readLoraSelections(data), advanced: {} }) });
      const result = await response.json(); setSubmitting(false);
      if (!response.ok) { setError(result.error ?? "Generation could not be started."); return; }
      router.push(`/jobs?focus=${result.job.id}`);
    }}>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <label htmlFor="prompt" className="mb-2 block text-sm font-bold">Prompt</label>
        <textarea id="prompt" name="prompt" required maxLength={4000} rows={9} placeholder="Describe the image, subject, setting, light, and visual treatment..." className="w-full resize-y rounded-md border border-[#b8beb7] bg-white p-4 text-base leading-7 outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[#b5d9d3]" />
        <label htmlFor="negative-prompt" className="mb-2 mt-5 block text-sm font-bold">Negative prompt</label>
        <textarea id="negative-prompt" name="negativePrompt" maxLength={4000} rows={4} defaultValue={DEFAULT_NEGATIVE_PROMPT} className="w-full resize-y rounded-md border border-[#b8beb7] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[#b5d9d3]" />
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
      </section>
      <aside className="space-y-5 border border-[var(--line)] bg-[var(--surface)] p-5">
        <Field label="Model"><select value={modelKey} onChange={(event) => setModelKey(event.target.value)} required className="control"><option value="" disabled>No model available</option>{models.map((model) => <option key={model.key} value={model.key} disabled={model.availability !== "available"}>{model.displayName}{model.availability !== "available" ? ` (${model.availability})` : ""}</option>)}</select></Field>
        {selected?.reason && <p className="text-xs leading-5 text-[var(--accent)]">{selected.reason}</p>}
        <Field label="Resolution"><select name="resolution" defaultValue={selected?.defaultResolution} key={modelKey} className="control">{(selected?.resolutions.length ? selected.resolutions : [selected?.defaultResolution ?? "1024x1024"]).map((resolution) => <option key={resolution}>{resolution}</option>)}</select></Field>
        <Field label="Outputs"><input className="control" name="count" type="number" min="1" max="4" defaultValue="1" /></Field>
        <Field label="Steps"><input className="control" name="steps" type="number" min="1" max="200" defaultValue="20" required /></Field>
        <LoraSelector key={modelKey} catalog={selected?.loraCatalog ?? { supported: false, loras: [], reason: "Select a model first." }} />
        <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-bold">Advanced</summary><div className="mt-4"><Field label="Seed"><input className="control" name="seed" type="number" min="0" max="2147483647" placeholder="Random" /></Field></div></details>
        <button type="submit" disabled={submitting || !modelKey} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 font-bold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"><Sparkles aria-hidden="true" size={18} />{submitting ? "Submitting..." : "Generate image"}</button>
      </aside>
      <style jsx>{`.control{width:100%;min-height:44px;border:1px solid #b8beb7;border-radius:6px;background:#fff;padding:0 12px;outline:none}.control:focus{border-color:var(--teal);box-shadow:0 0 0 2px #b5d9d3}`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>; }