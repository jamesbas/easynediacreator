"use client";

import { Sparkles, UserRoundPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { insertCharacterPrompt } from "@/lib/character-prompt";
import { DEFAULT_NEGATIVE_PROMPT, type ImageCreateRequest } from "@/lib/requests";
import type { LoraAccelerationPreset, LoraCatalog } from "@/lib/types";
import type { GenerationControls } from "@/lib/wan-gp/generation-controls";
import { hasGuidanceOneMarker } from "@/lib/wan-gp/image-guidance";
import { LoraSelector, readLoraSelections } from "./lora-selector";

type FormModel = { key: string; displayName: string; availability: string; reason?: string; controls: GenerationControls; guidanceLocked: boolean; loraCatalog: LoraCatalog };

export function ImageCreateForm({ models, defaultModel, characterPrompt, initialRequest }: { models: FormModel[]; defaultModel: string; characterPrompt: string; initialRequest?: ImageCreateRequest }) {
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const reusableModel = models.find((model) => model.key === initialRequest?.modelKey && model.availability === "available");
  const [prompt, setPrompt] = useState(initialRequest?.prompt ?? "");
  const [modelKey, setModelKey] = useState(reusableModel?.key ?? models.find((model) => model.key === defaultModel && model.availability === "available")?.key ?? models.find((model) => model.availability === "available")?.key ?? "");
  const selected = models.find((model) => model.key === modelKey);
  const [guidanceScale, setGuidanceScale] = useState(reusableModel ? initialRequest?.guidanceScale ?? reusableModel.controls.guidance?.defaultValue ?? 1 : selected?.controls.guidance?.defaultValue ?? 1);
  const [steps, setSteps] = useState(reusableModel ? initialRequest?.steps ?? reusableModel.controls.steps.defaultValue : selected?.controls.steps.defaultValue ?? 20);
  const [sampleSolver, setSampleSolver] = useState(reusableModel ? initialRequest?.sampleSolver ?? reusableModel.controls.defaultSolver ?? "" : selected?.controls.defaultSolver ?? "");
  const [scheduler, setScheduler] = useState(reusableModel ? initialRequest?.scheduler ?? reusableModel.controls.defaultScheduler ?? "" : selected?.controls.defaultScheduler ?? "");
  const [preset, setPreset] = useState<LoraAccelerationPreset | undefined>(() => reusableModel?.loraCatalog.accelerationPresets?.find((candidate) => candidate.id === initialRequest?.loraPresetId));
  const previousRecipeValues = useRef({ steps: reusableModel ? initialRequest?.steps ?? reusableModel.controls.steps.defaultValue : selected?.controls.steps.defaultValue ?? 20, guidance: reusableModel ? initialRequest?.guidanceScale ?? reusableModel.controls.guidance?.defaultValue ?? 1 : selected?.controls.guidance?.defaultValue ?? 1 });
  const [selectedLoraNames, setSelectedLoraNames] = useState<string[]>(initialRequest?.loras.map((lora) => lora.name) ?? []);
  const [reuseSelections, setReuseSelections] = useState(Boolean(reusableModel));
  const guidanceLocked = preset?.settings.guidanceScale !== undefined || selected?.guidanceLocked === true || (modelKey === "qwen-image" && hasGuidanceOneMarker(selectedLoraNames));
  const effectiveGuidance = preset?.settings.guidanceScale ?? (guidanceLocked ? 1 : guidanceScale);
  const effectiveSolver = preset?.settings.sampleSolver ?? sampleSolver;
  const handleLoraSelectionChange = useCallback((loras: { name: string }[]) => setSelectedLoraNames(loras.map((lora) => lora.name)), []);
  const [error, setError] = useState(initialRequest && !reusableModel ? "The saved model is no longer available. Choose another model before submitting." : "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={async (event) => {
      event.preventDefault(); setError(""); setSubmitting(true);
      const data = new FormData(event.currentTarget);
      const response = await fetch("/api/jobs/image-create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: data.get("prompt"), negativePrompt: data.get("negativePrompt"), modelKey, resolution: data.get("resolution") || undefined, count: Number(data.get("count")), steps, guidanceScale: effectiveGuidance, sampleSolver: sampleSolver || undefined, scheduler: scheduler || undefined, loraPresetId: data.get("loraPresetId") || undefined, seed: data.get("seed") ? Number(data.get("seed")) : undefined, loras: readLoraSelections(data), advanced: {} }) });
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
        <textarea id="negative-prompt" name="negativePrompt" maxLength={4000} rows={4} defaultValue={initialRequest?.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT} className="w-full resize-y rounded-md border border-[#b8beb7] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[#b5d9d3]" />
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
      </section>
      <aside className="space-y-5 border border-[var(--line)] bg-[var(--surface)] p-5">
        <Field label="Model"><select value={modelKey} onChange={(event) => { const next = models.find((model) => model.key === event.target.value); setModelKey(event.target.value); setGuidanceScale(next?.controls.guidance?.defaultValue ?? 1); setSteps(next?.controls.steps.defaultValue ?? 20); setSampleSolver(next?.controls.defaultSolver ?? ""); setScheduler(next?.controls.defaultScheduler ?? ""); setPreset(undefined); setSelectedLoraNames([]); setReuseSelections(false); }} required className="control"><option value="" disabled>No model available</option>{models.map((model) => <option key={model.key} value={model.key} disabled={model.availability !== "available"}>{model.displayName}{model.availability !== "available" ? ` (${model.availability})` : ""}</option>)}</select></Field>
        {selected?.reason && <p className="text-xs leading-5 text-[var(--accent)]">{selected.reason}</p>}
        <Field label="Resolution"><select name="resolution" defaultValue={reuseSelections ? initialRequest?.resolution ?? selected?.controls.defaultResolution : selected?.controls.defaultResolution} key={modelKey} className="control">{(selected?.controls.resolutions ?? [{ label: "1024x1024", value: "1024x1024" }]).map((resolution) => <option key={resolution.value} value={resolution.value}>{resolution.label}</option>)}</select></Field>
        <Field label="Outputs"><input className="control" name="count" type="number" min="1" max="4" defaultValue={initialRequest?.count ?? 1} /></Field>
        <Field label="Steps"><input className="control" name="steps" type="number" min={selected?.controls.steps.min ?? 1} max={selected?.controls.steps.max ?? 200} step={selected?.controls.steps.step ?? 1} value={preset?.settings.numInferenceSteps ?? steps} disabled={preset?.settings.numInferenceSteps !== undefined} onChange={(event) => setSteps(Number(event.target.value))} required /></Field>
        {selected?.controls.guidance && <Field label="Guidance (CFG)"><input className="control" name="guidanceScale" type="number" min={selected.controls.guidance.min} max={selected.controls.guidance.max} step={selected.controls.guidance.step} value={effectiveGuidance} disabled={guidanceLocked} onChange={(event) => setGuidanceScale(Number(event.target.value))} required /></Field>}
        {guidanceLocked && <p className="-mt-3 text-[0.68rem] leading-4 text-[var(--muted)]">Fixed at 1 for Qwen Lightning or distilled inference.</p>}
        <LoraSelector key={modelKey} catalog={selected?.loraCatalog ?? { supported: false, loras: [], reason: "Select a model first." }} initialLoras={reuseSelections ? initialRequest?.loras : undefined} initialPresetId={reuseSelections ? initialRequest?.loraPresetId : undefined} onSelectionChange={handleLoraSelectionChange} onPresetChange={(next) => { if (next) { previousRecipeValues.current = { steps, guidance: guidanceScale }; setPreset(next); } else { setPreset(undefined); setSteps(previousRecipeValues.current.steps); setGuidanceScale(previousRecipeValues.current.guidance); } }} />
        <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-bold">Advanced</summary><div className="mt-4 space-y-4">
          {selected?.controls.solvers.length ? <Field label="Solver"><select className="control" value={effectiveSolver} disabled={preset?.settings.sampleSolver !== undefined} onChange={(event) => setSampleSolver(event.target.value)}><option value="">Model default</option>{preset?.settings.sampleSolver && !selected.controls.solvers.some((choice) => choice.value === preset.settings.sampleSolver) && <option value={preset.settings.sampleSolver}>{preset.settings.sampleSolver}</option>}{selected.controls.solvers.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></Field> : null}
          {selected?.controls.schedulers.length ? <Field label="Scheduler"><select className="control" value={scheduler} onChange={(event) => setScheduler(event.target.value)}><option value="">Model default</option>{selected.controls.schedulers.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></Field> : null}
          <Field label="Seed"><input className="control" name="seed" type="number" min="0" max="2147483647" placeholder="Random" defaultValue={initialRequest?.seed} /></Field>
        </div></details>
        <button type="submit" disabled={submitting || !modelKey} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 font-bold text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"><Sparkles aria-hidden="true" size={18} />{submitting ? "Submitting..." : "Generate image"}</button>
      </aside>
      <style jsx>{`.control{width:100%;min-height:44px;border:1px solid #b8beb7;border-radius:6px;background:#fff;padding:0 12px;outline:none}.control:focus{border-color:var(--teal);box-shadow:0 0 0 2px #b5d9d3}`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>; }