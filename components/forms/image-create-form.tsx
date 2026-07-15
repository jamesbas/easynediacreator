"use client";

import { Sparkles, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { insertCharacterPrompt } from "@/lib/character-prompt";
import { DEFAULT_NEGATIVE_PROMPT } from "@/lib/requests";
import type { LoraAccelerationPreset, LoraCatalog } from "@/lib/types";
import { hasGuidanceOneMarker } from "@/lib/wan-gp/image-guidance";
import { LoraSelector, readLoraSelections } from "./lora-selector";

type FormModel = { key: string; displayName: string; availability: string; reason?: string; resolutions: string[]; defaultResolution: string; defaultSteps: number; defaultGuidance: number; guidanceLocked: boolean; loraCatalog: LoraCatalog };

export function ImageCreateForm({ models, defaultModel, characterPrompt }: { models: FormModel[]; defaultModel: string; characterPrompt: string }) {
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState("");
  const [modelKey, setModelKey] = useState(models.find((model) => model.key === defaultModel && model.availability === "available")?.key ?? models.find((model) => model.availability === "available")?.key ?? "");
  const selected = models.find((model) => model.key === modelKey);
  const [guidanceScale, setGuidanceScale] = useState(selected?.defaultGuidance ?? 1);
  const [steps, setSteps] = useState(selected?.defaultSteps ?? 20);
  const [preset, setPreset] = useState<LoraAccelerationPreset>();
  const previousRecipeValues = useRef({ steps: selected?.defaultSteps ?? 20, guidance: selected?.defaultGuidance ?? 1 });
  const [selectedLoraNames, setSelectedLoraNames] = useState<string[]>([]);
  const guidanceLocked = preset?.settings.guidanceScale !== undefined || selected?.guidanceLocked === true || (modelKey === "qwen-image" && hasGuidanceOneMarker(selectedLoraNames));
  const effectiveGuidance = preset?.settings.guidanceScale ?? (guidanceLocked ? 1 : guidanceScale);
  const handleLoraSelectionChange = useCallback((loras: { name: string }[]) => setSelectedLoraNames(loras.map((lora) => lora.name)), []);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={async (event) => {
      event.preventDefault(); setError(""); setSubmitting(true);
      const data = new FormData(event.currentTarget);
      const response = await fetch("/api/jobs/image-create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: data.get("prompt"), negativePrompt: data.get("negativePrompt"), modelKey, resolution: data.get("resolution") || undefined, count: Number(data.get("count")), steps, guidanceScale: effectiveGuidance, loraPresetId: data.get("loraPresetId") || undefined, seed: data.get("seed") ? Number(data.get("seed")) : undefined, loras: readLoraSelections(data), advanced: {} }) });
      const result = await response.json(); setSubmitting(false);
      if (!response.ok) { setError(result.error ?? "Generation could not be started."); return; }
      router.push(`/jobs?focus=${result.job.id}`);
    }}>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><label htmlFor="prompt" className="block text-sm font-bold">Prompt</label><button type="button" disabled={!characterPrompt.trim()} onClick={() => {
          const textarea = promptRef.current;
          const inserted = insertCharacterPrompt(prompt, characterPrompt, textarea?.selectionStart, textarea?.selectionEnd);
          if (inserted.value.length > 4000) { setError("The character prompt would exceed the 4,000-character prompt limit."); return; }
          setError(""); setPrompt(inserted.value);
          requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(inserted.cursor, inserted.cursor); });
        }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-xs font-bold hover:border-[var(--teal)] disabled:opacity-50"><UserRoundPlus size={16} />Insert character</button></div>
        <textarea ref={promptRef} id="prompt" name="prompt" required maxLength={4000} rows={9} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the image, subject, setting, light, and visual treatment..." className="w-full resize-y rounded-md border border-[#b8beb7] bg-white p-4 text-base leading-7 outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[#b5d9d3]" />
        <label htmlFor="negative-prompt" className="mb-2 mt-5 block text-sm font-bold">Negative prompt</label>
        <textarea id="negative-prompt" name="negativePrompt" maxLength={4000} rows={4} defaultValue={DEFAULT_NEGATIVE_PROMPT} className="w-full resize-y rounded-md border border-[#b8beb7] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[#b5d9d3]" />
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
      </section>
      <aside className="space-y-5 border border-[var(--line)] bg-[var(--surface)] p-5">
        <Field label="Model"><select value={modelKey} onChange={(event) => { const next = models.find((model) => model.key === event.target.value); setModelKey(event.target.value); setGuidanceScale(next?.defaultGuidance ?? 1); setSteps(next?.defaultSteps ?? 20); setPreset(undefined); setSelectedLoraNames([]); }} required className="control"><option value="" disabled>No model available</option>{models.map((model) => <option key={model.key} value={model.key} disabled={model.availability !== "available"}>{model.displayName}{model.availability !== "available" ? ` (${model.availability})` : ""}</option>)}</select></Field>
        {selected?.reason && <p className="text-xs leading-5 text-[var(--accent)]">{selected.reason}</p>}
        <Field label="Resolution"><select name="resolution" defaultValue={selected?.defaultResolution} key={modelKey} className="control">{(selected?.resolutions.length ? selected.resolutions : [selected?.defaultResolution ?? "1024x1024"]).map((resolution) => <option key={resolution}>{resolution}</option>)}</select></Field>
        <Field label="Outputs"><input className="control" name="count" type="number" min="1" max="4" defaultValue="1" /></Field>
        <Field label="Steps"><input className="control" name="steps" type="number" min="1" max="200" value={preset?.settings.numInferenceSteps ?? steps} disabled={preset?.settings.numInferenceSteps !== undefined} onChange={(event) => setSteps(Number(event.target.value))} required /></Field>
        <Field label="Guidance (CFG)"><input className="control" name="guidanceScale" type="number" min="0" max="30" step="0.1" value={effectiveGuidance} disabled={guidanceLocked} onChange={(event) => setGuidanceScale(Number(event.target.value))} required /></Field>
        {guidanceLocked && <p className="-mt-3 text-[0.68rem] leading-4 text-[var(--muted)]">Fixed at 1 for Qwen Lightning or distilled inference.</p>}
        <LoraSelector key={modelKey} catalog={selected?.loraCatalog ?? { supported: false, loras: [], reason: "Select a model first." }} onSelectionChange={handleLoraSelectionChange} onPresetChange={(next) => { if (next) { previousRecipeValues.current = { steps, guidance: guidanceScale }; setPreset(next); } else { setPreset(undefined); setSteps(previousRecipeValues.current.steps); setGuidanceScale(previousRecipeValues.current.guidance); } }} />
        <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-bold">Advanced</summary><div className="mt-4"><Field label="Seed"><input className="control" name="seed" type="number" min="0" max="2147483647" placeholder="Random" /></Field></div></details>
        <button type="submit" disabled={submitting || !modelKey} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 font-bold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"><Sparkles aria-hidden="true" size={18} />{submitting ? "Submitting..." : "Generate image"}</button>
      </aside>
      <style jsx>{`.control{width:100%;min-height:44px;border:1px solid #b8beb7;border-radius:6px;background:#fff;padding:0 12px;outline:none}.control:focus{border-color:var(--teal);box-shadow:0 0 0 2px #b5d9d3}`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>; }