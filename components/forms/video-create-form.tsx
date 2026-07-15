"use client";

import { Clapperboard, ImagePlus } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_NEGATIVE_PROMPT, type VideoCreateRequest } from "@/lib/requests";
import type { LoraCatalog } from "@/lib/types";
import { LoraSelector, readLoraSelections } from "./lora-selector";

type FormModel = {
  key: string;
  displayName: string;
  availability: string;
  resolutions: string[];
  durations: number[];
  defaultResolution: string;
  defaultDuration: number;
  defaultFps: number;
  defaultSourceStrength: number;
  defaultSteps: number;
  supportsEndFrame: boolean;
  loraCatalog: LoraCatalog;
};
type AssetOption = { id: string; filename: string; contentUrl: string };
type PickedImage = { file?: File; uploadId?: string; assetId?: string; preview?: string };

export function VideoCreateForm({ models, assets, defaultModel, initialStartId, initialRequest }: { models: FormModel[]; assets: AssetOption[]; defaultModel: string; initialStartId?: string; initialRequest?: VideoCreateRequest }) {
  const router = useRouter();
  const reusableModel = models.find((model) => model.key === initialRequest?.modelKey && model.availability === "available");
  const [modelKey, setModelKey] = useState(reusableModel?.key ?? models.find((model) => model.key === defaultModel && model.availability === "available")?.key ?? models.find((model) => model.availability === "available")?.key ?? "");
  const [start, setStart] = useState<PickedImage>({ uploadId: initialRequest?.startUploadId, assetId: initialRequest?.startAssetId ?? initialStartId });
  const [end, setEnd] = useState<PickedImage>({ uploadId: initialRequest?.endUploadId, assetId: initialRequest?.endAssetId });
  const [error, setError] = useState(initialRequest && !reusableModel ? "The saved model is no longer available. Choose another model before submitting." : "");
  const [submitting, setSubmitting] = useState(false);
  const selected = models.find((model) => model.key === modelKey);
  const [sourceStrength, setSourceStrength] = useState(reusableModel ? initialRequest?.sourceStrength ?? reusableModel.defaultSourceStrength : selected?.defaultSourceStrength ?? 0.85);
  const [reuseSelections, setReuseSelections] = useState(Boolean(reusableModel));

  async function upload(file?: File) {
    if (!file) return undefined;
    const body = new FormData(); body.set("image", file);
    const response = await fetch("/api/uploads/image", { method: "POST", body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result.upload.id as string;
  }

  return <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; setError(""); setSubmitting(true);
    try {
      const startUploadId = await upload(start.file) ?? start.uploadId;
      const endUploadId = await upload(end.file) ?? end.uploadId;
      const data = new FormData(form);
      const response = await fetch("/api/jobs/video-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUploadId,
          startAssetId: startUploadId ? undefined : start.assetId,
          endUploadId,
          endAssetId: endUploadId ? undefined : end.assetId,
          prompt: data.get("prompt"),
          negativePrompt: data.get("negativePrompt"),
          modelKey,
          resolution: data.get("resolution") || undefined,
          durationSeconds: Number(data.get("duration")),
          fps: Number(data.get("fps")),
          sourceStrength: Number(data.get("sourceStrength")),
          steps: Number(data.get("steps")),
          loraPresetId: data.get("loraPresetId") || undefined,
          seed: data.get("seed") ? Number(data.get("seed")) : undefined,
          loras: readLoraSelections(data),
          advanced: {},
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(`/jobs?focus=${result.job.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video generation could not be started."); setSubmitting(false);
    }
  }}>
    <div className="space-y-6">
      <section className="grid gap-4 border border-[var(--line)] bg-[var(--surface)] p-5 sm:grid-cols-2 sm:p-7">
        <ImagePicker label="Start image" required value={start} onChange={setStart} assets={assets} />
        <ImagePicker label="End image" value={end} onChange={setEnd} assets={assets} disabled={!selected?.supportsEndFrame} />
      </section>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <label htmlFor="video-prompt" className="mb-2 block text-sm font-bold">Video prompt</label>
        <textarea id="video-prompt" name="prompt" required rows={7} maxLength={4000} defaultValue={initialRequest?.prompt} placeholder="Describe motion, camera movement, pacing, and what changes in the scene..." className="w-full rounded-md border border-[#b8beb7] bg-white p-4 leading-7 outline-none focus:border-[var(--teal)]" />
        <label htmlFor="video-negative-prompt" className="mb-2 mt-5 block text-sm font-bold">Negative prompt</label>
        <textarea id="video-negative-prompt" name="negativePrompt" rows={4} maxLength={4000} defaultValue={initialRequest?.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT} className="w-full rounded-md border border-[#b8beb7] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--teal)]" />
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
      </section>
    </div>
    <aside className="space-y-5 border border-[var(--line)] bg-[var(--surface)] p-5">
      <Control label="LTX-2 model"><select value={modelKey} onChange={(event) => { const next = models.find((model) => model.key === event.target.value); setModelKey(event.target.value); setSourceStrength(next?.defaultSourceStrength ?? 0.85); setReuseSelections(false); }} className="control"><option value="" disabled>No model available</option>{models.map((model) => <option key={model.key} value={model.key} disabled={model.availability !== "available"}>{model.displayName}</option>)}</select></Control>
      <Control label="Duration"><select key={`duration-${modelKey}`} name="duration" defaultValue={reuseSelections ? initialRequest?.durationSeconds ?? selected?.defaultDuration ?? 15 : selected?.defaultDuration ?? 15} className="control">{(selected?.durations.length ? selected.durations : [15]).map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></Control>
      <Control label="Resolution"><select key={`resolution-${modelKey}`} name="resolution" defaultValue={reuseSelections ? initialRequest?.resolution ?? selected?.defaultResolution : selected?.defaultResolution} className="control">{(selected?.resolutions.length ? selected.resolutions : [selected?.defaultResolution ?? "1280x720"]).map((value) => <option key={value}>{value}</option>)}</select></Control>
      <label className="block"><span className="mb-2 flex items-center justify-between gap-3 text-sm font-bold"><span>Start image / source strength</span><output htmlFor="source-strength">{sourceStrength.toFixed(2)}</output></span><input id="source-strength" aria-label="Start image / source strength" className="w-full accent-[var(--teal)]" name="sourceStrength" type="range" min="0" max="1" step="0.05" value={sourceStrength} onChange={(event) => setSourceStrength(Number(event.target.value))} /></label>
      <Control label="Steps"><input key={`steps-${modelKey}`} className="control" name="steps" type="number" min="1" max="200" defaultValue={reuseSelections ? initialRequest?.steps ?? selected?.defaultSteps ?? 8 : selected?.defaultSteps ?? 8} required /></Control>
      <LoraSelector key={modelKey} catalog={selected?.loraCatalog ?? { supported: false, loras: [], reason: "Select a model first." }} initialLoras={reuseSelections ? initialRequest?.loras : undefined} initialPresetId={reuseSelections ? initialRequest?.loraPresetId : undefined} />
      <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-bold">Advanced</summary><div className="mt-4 space-y-4"><Control label="Frames per second"><input className="control" name="fps" type="number" min="1" max="120" defaultValue={initialRequest?.fps ?? selected?.defaultFps ?? 24} /></Control><Control label="Seed"><input className="control" name="seed" type="number" min="0" max="2147483647" placeholder="Random" defaultValue={initialRequest?.seed} /></Control></div></details>
      <button disabled={submitting || !modelKey || (!start.file && !start.uploadId && !start.assetId)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 font-bold text-white disabled:opacity-50"><Clapperboard size={18} />{submitting ? "Submitting..." : "Generate video"}</button>
    </aside>
    <style jsx>{`.control{width:100%;min-height:44px;border:1px solid #b8beb7;border-radius:6px;background:#fff;padding:0 12px}`}</style>
  </form>;
}

function Control({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-bold">{label}</span>{children}</label>; }

function ImagePicker({ label, required, disabled, value, onChange, assets }: { label: string; required?: boolean; disabled?: boolean; value: PickedImage; onChange: (value: PickedImage) => void; assets: AssetOption[] }) {
  const selectedAsset = assets.find((asset) => asset.id === value.assetId);
  const preview = value.preview ?? (value.uploadId ? `/api/uploads/${value.uploadId}/content` : selectedAsset?.contentUrl);
  return <fieldset disabled={disabled} className="min-w-0 disabled:opacity-45"><legend className="mb-2 text-sm font-bold">{label}{required ? " *" : ""}</legend><label className="relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden border border-dashed border-[#9ca69d] bg-[#f6f4ee] text-center">{preview ? <Image src={preview} alt={`${label} preview`} fill sizes="50vw" className="object-contain" unoptimized /> : <span><ImagePlus className="mx-auto mb-2 text-[var(--teal)]" /><span className="text-xs font-semibold">Choose image</span></span>}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; onChange(file ? { file, preview: URL.createObjectURL(file) } : {}); }} /></label>{assets.length > 0 && <select aria-label={`${label} from outputs`} value={value.assetId ?? ""} onChange={(event) => onChange(event.target.value ? { assetId: event.target.value } : {})} className="mt-2 min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs"><option value="">Or select an output</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select>}{disabled && <p className="mt-2 text-xs text-[var(--muted)]">Not supported by this model.</p>}</fieldset>;
}