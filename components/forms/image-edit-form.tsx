"use client";

import { ImagePlus, Paintbrush, Upload } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_NEGATIVE_PROMPT } from "@/lib/requests";
import type { LoraCatalog } from "@/lib/types";
import { LoraSelector, readLoraSelections } from "./lora-selector";

type FormModel = { key: string; displayName: string; availability: string; resolutions: string[]; defaultResolution: string; loraCatalog: LoraCatalog };
type AssetOption = { id: string; filename: string; contentUrl: string };

export function ImageEditForm({ models, assets, defaultModel, initialAssetId }: { models: FormModel[]; assets: AssetOption[]; defaultModel: string; initialAssetId?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [sourceAssetId, setSourceAssetId] = useState(initialAssetId ?? "");
  const [modelKey, setModelKey] = useState(models.find((model) => model.key === defaultModel && model.availability === "available")?.key ?? models.find((model) => model.availability === "available")?.key ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selected = models.find((model) => model.key === modelKey);

  const chooseFile = useCallback((next?: File) => { if (preview) URL.revokeObjectURL(preview); setFile(next); setPreview(next ? URL.createObjectURL(next) : undefined); if (next) setSourceAssetId(""); }, [preview]);
  useEffect(() => { const paste = (event: ClipboardEvent) => { const image = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/")); if (image) chooseFile(image); }; window.addEventListener("paste", paste); return () => window.removeEventListener("paste", paste); }, [chooseFile]);

  return <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={async (event) => {
    event.preventDefault(); const form = event.currentTarget; setError(""); setSubmitting(true); let sourceUploadId: string | undefined;
    if (file) { const uploadBody = new FormData(); uploadBody.set("image", file); const uploadResponse = await fetch("/api/uploads/image", { method: "POST", body: uploadBody }); const uploadResult = await uploadResponse.json(); if (!uploadResponse.ok) { setError(uploadResult.error); setSubmitting(false); return; } sourceUploadId = uploadResult.upload.id; }
    const data = new FormData(form); const response = await fetch("/api/jobs/image-edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUploadId, sourceAssetId: sourceUploadId ? undefined : sourceAssetId || undefined, prompt: data.get("prompt"), negativePrompt: data.get("negativePrompt"), modelKey, resolution: data.get("resolution") || undefined, steps: Number(data.get("steps")), seed: data.get("seed") ? Number(data.get("seed")) : undefined, loras: readLoraSelections(data), advanced: {} }) }); const result = await response.json(); setSubmitting(false); if (!response.ok) { setError(result.error); return; } router.push(`/jobs?focus=${result.job.id}`);
  }}>
    <div className="space-y-6">
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <h2 className="text-sm font-bold">Source image</h2>
        <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }} className="mt-3 flex min-h-52 cursor-pointer items-center justify-center overflow-hidden border border-dashed border-[#9ca69d] bg-[#f6f4ee] text-center hover:border-[var(--teal)]">
          {preview ? <span className="relative block h-80 w-full"><Image src={preview} alt="Selected source preview" fill sizes="100vw" className="object-contain" unoptimized /></span> : <span><ImagePlus className="mx-auto mb-3 text-[var(--teal)]" size={30} /><strong className="block">Drop, paste, or choose an image</strong><span className="mt-1 block text-xs text-[var(--muted)]">JPEG, PNG, or WebP</span></span>}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>
        {assets.length > 0 && <label className="mt-4 block text-sm font-bold">Or choose an output<select value={sourceAssetId} onChange={(event) => { setSourceAssetId(event.target.value); if (event.target.value) chooseFile(); }} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 font-normal"><option value="">Select an image...</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>}
      </section>
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7"><label htmlFor="edit-prompt" className="mb-2 block text-sm font-bold">Edit prompt</label><textarea id="edit-prompt" name="prompt" required rows={7} maxLength={4000} placeholder="Describe what should change and what should stay the same..." className="w-full rounded-md border border-[#b8beb7] bg-white p-4 leading-7 outline-none focus:border-[var(--teal)]" /><label htmlFor="edit-negative-prompt" className="mb-2 mt-5 block text-sm font-bold">Negative prompt</label><textarea id="edit-negative-prompt" name="negativePrompt" rows={4} maxLength={4000} defaultValue={DEFAULT_NEGATIVE_PROMPT} className="w-full rounded-md border border-[#b8beb7] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--teal)]" />{error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}</section>
    </div>
    <aside className="space-y-5 border border-[var(--line)] bg-[var(--surface)] p-5"><label className="block text-sm font-bold">Model<select value={modelKey} onChange={(event) => setModelKey(event.target.value)} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3"><option value="" disabled>No model available</option>{models.map((model) => <option key={model.key} value={model.key} disabled={model.availability !== "available"}>{model.displayName}</option>)}</select></label><label className="block text-sm font-bold">Resolution<select name="resolution" key={modelKey} defaultValue={selected?.defaultResolution} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3">{(selected?.resolutions.length ? selected.resolutions : [selected?.defaultResolution ?? "1024x1024"]).map((value) => <option key={value}>{value}</option>)}</select></label><label className="block text-sm font-bold">Steps<input name="steps" type="number" min="1" max="200" defaultValue="20" required className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3" /></label><LoraSelector key={modelKey} catalog={selected?.loraCatalog ?? { supported: false, loras: [], reason: "Select a model first." }} /><details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-bold">Advanced</summary><label className="mt-4 block text-sm font-bold">Seed<input name="seed" type="number" min="0" max="2147483647" placeholder="Random" className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3" /></label></details><button disabled={submitting || !modelKey || (!file && !sourceAssetId)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 font-bold text-white disabled:opacity-50"><Paintbrush size={18} />{submitting ? "Submitting..." : "Edit image"}</button><p className="flex gap-2 text-xs leading-5 text-[var(--muted)]"><Upload size={15} className="shrink-0" />Uploads remain private on this computer.</p></aside>
  </form>;
}