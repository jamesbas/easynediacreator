"use client";

import { ImagePlus, Paintbrush, Sparkles, Trash2, Upload, UserRoundCheck } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FACE_SWAP_LORAS, FACE_SWAP_PROMPT, FACE_SWAP_STEPS } from "@/lib/face-swap-preset";
import { DEFAULT_NEGATIVE_PROMPT, type ImageEditRequest } from "@/lib/requests";
import { SHARPEN_UNBLUR_LORA, SHARPEN_UNBLUR_PROMPT } from "@/lib/sharpen-unblur-preset";
import type { LoraAccelerationPreset, LoraCatalog } from "@/lib/types";
import { LoraSelector, readLoraSelections } from "./lora-selector";

type FormModel = { key: string; displayName: string; availability: string; resolutions: string[]; defaultResolution: string; loraCatalog: LoraCatalog };
type AssetOption = { id: string; filename: string; contentUrl: string };
type ReferenceFile = { id: string; file: File; preview: string };

async function uploadImage(file: File) {
  const body = new FormData();
  body.set("image", file);
  const response = await fetch("/api/uploads/image", { method: "POST", body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Image upload failed.");
  return String(result.upload.id);
}

export function ImageEditForm({ models, assets, defaultModel, initialAssetId, initialRequest }: { models: FormModel[]; assets: AssetOption[]; defaultModel: string; initialAssetId?: string; initialRequest?: ImageEditRequest }) {
  const router = useRouter();
  const previewUrls = useRef(new Set<string>());
  const previousPrompt = useRef("");
  const previousSteps = useRef(20);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string | undefined>(initialRequest?.sourceUploadId ? `/api/uploads/${initialRequest.sourceUploadId}/content` : undefined);
  const [sourceUploadId, setSourceUploadId] = useState(initialRequest?.sourceUploadId ?? "");
  const [sourceAssetId, setSourceAssetId] = useState(initialRequest?.sourceAssetId ?? initialAssetId ?? "");
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
  const [referenceUploadIds, setReferenceUploadIds] = useState<string[]>(initialRequest?.referenceUploadIds ?? []);
  const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>(initialRequest?.referenceAssetIds ?? []);
  const reusableModel = models.find((model) => model.key === initialRequest?.modelKey && model.availability === "available");
  const [modelKey, setModelKey] = useState(reusableModel?.key ?? models.find((model) => model.key === defaultModel && model.availability === "available")?.key ?? models.find((model) => model.availability === "available")?.key ?? "");
  const [faceSwap, setFaceSwap] = useState(Boolean(reusableModel && initialRequest?.faceSwap));
  const [sharpenUnblur, setSharpenUnblur] = useState(Boolean(reusableModel && initialRequest?.sharpenUnblur));
  const [prompt, setPrompt] = useState(initialRequest?.prompt ?? "");
  const [steps, setSteps] = useState(initialRequest?.steps ?? 20);
  const [accelerationPreset, setAccelerationPreset] = useState<LoraAccelerationPreset | undefined>(() => reusableModel?.loraCatalog.accelerationPresets?.find((candidate) => candidate.id === initialRequest?.loraPresetId));
  const previousAccelerationSteps = useRef(initialRequest?.steps ?? 20);
  const [reuseSelections, setReuseSelections] = useState(Boolean(reusableModel));
  const [error, setError] = useState(initialRequest && !reusableModel ? "The saved model is no longer available. Choose another model before submitting." : "");
  const [submitting, setSubmitting] = useState(false);
  const selected = models.find((model) => model.key === modelKey);
  const qwenModel = models.find((model) => model.key === "qwen-image-edit" && model.availability === "available");
  const sharpenUnblurAvailable = Boolean(qwenModel?.loraCatalog.loras.some((name) => name.toLocaleLowerCase() === SHARPEN_UNBLUR_LORA.name.toLocaleLowerCase()));
  const referenceCount = referenceFiles.length + referenceUploadIds.length + referenceAssetIds.length;

  const createPreview = useCallback((next: File) => {
    const url = URL.createObjectURL(next);
    previewUrls.current.add(url);
    return url;
  }, []);

  const chooseFile = useCallback((next?: File) => {
    setFile(next);
    setPreview((current) => {
      if (current && previewUrls.current.has(current)) {
        URL.revokeObjectURL(current);
        previewUrls.current.delete(current);
      }
      return next ? createPreview(next) : undefined;
    });
    setSourceUploadId("");
    if (next) setSourceAssetId("");
  }, [createPreview]);

  const addReferenceFiles = useCallback((files: File[]) => {
    const remaining = 8 - referenceCount;
    if (remaining <= 0) {
      setError("Choose no more than 8 reference images.");
      return;
    }
    const accepted = files.filter((item) => item.type.startsWith("image/")).slice(0, remaining);
    if (accepted.length !== files.length) setError("Only the first 8 valid image references were added.");
    setReferenceFiles((current) => [...current, ...accepted.map((item) => ({ id: crypto.randomUUID(), file: item, preview: createPreview(item) }))]);
    if (accepted.length && qwenModel) setModelKey(qwenModel.key);
  }, [createPreview, qwenModel, referenceCount]);

  const removeReferenceFile = (id: string) => {
    setReferenceFiles((current) => current.filter((item) => {
      if (item.id !== id) return true;
      URL.revokeObjectURL(item.preview);
      previewUrls.current.delete(item.preview);
      return false;
    }));
  };

  const setFaceSwapEnabled = (enabled: boolean) => {
    setError("");
    setFaceSwap(enabled);
    if (enabled) {
      if (!sharpenUnblur) {
        previousPrompt.current = prompt;
        previousSteps.current = steps;
      }
      setSharpenUnblur(false);
      setAccelerationPreset(undefined);
      setPrompt(FACE_SWAP_PROMPT);
      setSteps(FACE_SWAP_STEPS);
      if (qwenModel) setModelKey(qwenModel.key);
    } else {
      setPrompt(previousPrompt.current);
      setSteps(previousSteps.current);
    }
  };

  const setSharpenUnblurEnabled = (enabled: boolean) => {
    setError("");
    setSharpenUnblur(enabled);
    if (enabled) {
      if (!faceSwap) previousPrompt.current = prompt;
      if (faceSwap) {
        setFaceSwap(false);
        setSteps(previousSteps.current);
      }
      setAccelerationPreset(undefined);
      setPrompt(SHARPEN_UNBLUR_PROMPT);
      if (qwenModel) setModelKey(qwenModel.key);
    } else {
      setPrompt(previousPrompt.current);
    }
  };

  useEffect(() => {
    const urls = previewUrls.current;
    const paste = (event: ClipboardEvent) => {
      const image = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
      if (image) chooseFile(image);
    };
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("paste", paste);
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [chooseFile]);

  return <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    if (faceSwap && referenceCount !== 1) {
      setError("Face swap requires exactly one reference image.");
      return;
    }
    setSubmitting(true);
    try {
      const submittedSourceUploadId = file ? await uploadImage(file) : sourceUploadId || undefined;
      const submittedReferenceUploadIds = [...referenceUploadIds, ...await Promise.all(referenceFiles.map((reference) => uploadImage(reference.file)))];
      const data = new FormData(form);
      const response = await fetch("/api/jobs/image-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUploadId: submittedSourceUploadId,
          sourceAssetId: submittedSourceUploadId ? undefined : sourceAssetId || undefined,
          referenceUploadIds: submittedReferenceUploadIds,
          referenceAssetIds,
          faceSwap,
          sharpenUnblur,
          prompt,
          negativePrompt: data.get("negativePrompt"),
          modelKey,
          resolution: data.get("resolution") || undefined,
          steps,
          seed: data.get("seed") ? Number(data.get("seed")) : undefined,
          loraPresetId: faceSwap || sharpenUnblur ? undefined : data.get("loraPresetId") || undefined,
          loras: faceSwap || sharpenUnblur ? [] : readLoraSelections(data),
          advanced: {},
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Image editing could not be started.");
      router.push(`/jobs?focus=${result.job.id}`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Image editing could not be started.");
      setSubmitting(false);
    }
  }}>
    <div className="space-y-6">
      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <h2 className="text-sm font-bold">Source image</h2>
        <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }} className="mt-3 flex min-h-52 cursor-pointer items-center justify-center overflow-hidden border border-dashed border-[#9ca69d] bg-[#f6f4ee] text-center hover:border-[var(--teal)]">
          {preview ? <span className="relative block h-80 w-full"><Image src={preview} alt="Selected source preview" fill sizes="(max-width: 1024px) 100vw, 70vw" className="object-contain" unoptimized /></span> : <span><ImagePlus className="mx-auto mb-3 text-[var(--teal)]" size={30} /><strong className="block">Drop, paste, or choose an image</strong><span className="mt-1 block text-xs text-[var(--muted)]">JPEG, PNG, or WebP</span></span>}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>
        {assets.length > 0 && <label className="mt-4 block text-sm font-bold">Or choose an output<select value={sourceAssetId} onChange={(event) => { setSourceAssetId(event.target.value); if (event.target.value) chooseFile(); }} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 font-normal"><option value="">Select an image...</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>}
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-bold">Reference images</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Add people or objects that Qwen should use while editing the source.</p></div><span className="shrink-0 text-xs font-bold text-[var(--muted)]">{referenceCount}/8</span></div>
        <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addReferenceFiles([...event.dataTransfer.files]); }} className="mt-3 flex min-h-28 cursor-pointer items-center justify-center border border-dashed border-[#9ca69d] bg-[#f6f4ee] px-4 text-center hover:border-[var(--teal)]">
          <span><Upload className="mx-auto mb-2 text-[var(--teal)]" size={24} /><strong className="block text-sm">Drop or choose reference images</strong></span>
          <input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => { addReferenceFiles([...(event.target.files ?? [])]); event.target.value = ""; }} />
        </label>
        {(referenceUploadIds.length > 0 || referenceFiles.length > 0) && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{referenceUploadIds.map((uploadId, index) => <div key={uploadId} className="relative aspect-square overflow-hidden border border-[var(--line)] bg-[#f6f4ee]"><Image src={`/api/uploads/${uploadId}/content`} alt={`Saved reference ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 220px" className="object-cover" unoptimized /><button type="button" onClick={() => setReferenceUploadIds((current) => current.filter((id) => id !== uploadId))} title="Remove reference" aria-label={`Remove saved reference ${index + 1}`} className="absolute right-2 top-2 grid size-9 place-items-center rounded-md bg-white text-[var(--foreground)] shadow-sm"><Trash2 size={16} /></button></div>)}{referenceFiles.map((reference, index) => <div key={reference.id} className="relative aspect-square overflow-hidden border border-[var(--line)] bg-[#f6f4ee]"><Image src={reference.preview} alt={`Reference ${referenceUploadIds.length + index + 1}`} fill sizes="(max-width: 640px) 50vw, 220px" className="object-cover" unoptimized /><button type="button" onClick={() => removeReferenceFile(reference.id)} title="Remove reference" aria-label={`Remove reference ${referenceUploadIds.length + index + 1}`} className="absolute right-2 top-2 grid size-9 place-items-center rounded-md bg-white text-[var(--foreground)] shadow-sm"><Trash2 size={16} /></button></div>)}</div>}
        {assets.length > 0 && <fieldset className="mt-4"><legend className="text-sm font-bold">Or use image outputs</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{assets.map((asset) => { const checked = referenceAssetIds.includes(asset.id); return <label key={asset.id} className="flex min-w-0 items-center gap-3 border border-[var(--line)] bg-white p-2 text-xs"><input type="checkbox" checked={checked} disabled={!checked && referenceCount >= 8} onChange={(event) => { setReferenceAssetIds((current) => event.target.checked ? [...current, asset.id] : current.filter((id) => id !== asset.id)); if (event.target.checked && qwenModel) setModelKey(qwenModel.key); }} /><span className="relative size-10 shrink-0 overflow-hidden bg-[#f6f4ee]"><Image src={asset.contentUrl} alt="" fill sizes="40px" className="object-cover" unoptimized /></span><span className="truncate">{asset.filename}</span></label>; })}</div></fieldset>}
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
        <label htmlFor="edit-prompt" className="mb-2 block text-sm font-bold">Edit prompt</label>
        <textarea id="edit-prompt" name="prompt" required readOnly={faceSwap} rows={7} maxLength={4000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe what should change and what should stay the same..." className="w-full rounded-md border border-[#b8beb7] bg-white p-4 leading-7 outline-none focus:border-[var(--teal)] read-only:bg-[#f1f0eb]" />
        <label htmlFor="edit-negative-prompt" className="mb-2 mt-5 block text-sm font-bold">Negative prompt</label>
        <textarea id="edit-negative-prompt" name="negativePrompt" rows={4} maxLength={4000} defaultValue={initialRequest?.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT} className="w-full rounded-md border border-[#b8beb7] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--teal)]" />
        {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
      </section>
    </div>

    <aside className="space-y-5 border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="space-y-4 border-b border-[var(--line)] pb-5">
        <label className={`flex items-center justify-between gap-3 ${qwenModel ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
          <span><span className="flex items-center gap-2 text-sm font-bold"><UserRoundCheck size={17} />Face swap</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Apply the Qwen face-swap preset.</span></span>
          <span className="relative h-6 w-11 shrink-0">
            <input type="checkbox" className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" role="switch" checked={faceSwap} disabled={!qwenModel} onChange={(event) => setFaceSwapEnabled(event.target.checked)} />
            <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[#aeb5af] transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[var(--teal)] peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--teal)]" />
          </span>
        </label>
        <label className={`flex items-center justify-between gap-3 ${sharpenUnblurAvailable ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
          <span><span className="flex items-center gap-2 text-sm font-bold"><Sparkles size={17} />Sharpen and Unblur</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">Apply the Qwen unblur and upscale LoRA.</span></span>
          <span className="relative h-6 w-11 shrink-0">
            <input type="checkbox" className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" role="switch" checked={sharpenUnblur} disabled={!sharpenUnblurAvailable} onChange={(event) => setSharpenUnblurEnabled(event.target.checked)} />
            <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[#aeb5af] transition-colors after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[var(--teal)] peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--teal)]" />
          </span>
        </label>
      </div>
      <label className="block text-sm font-bold">Model<select value={modelKey} disabled={faceSwap || sharpenUnblur || referenceCount > 0} onChange={(event) => { setModelKey(event.target.value); setReuseSelections(false); }} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 disabled:bg-[#f1f0eb]"><option value="" disabled>No model available</option>{models.map((model) => <option key={model.key} value={model.key} disabled={model.availability !== "available" || (referenceCount > 0 && model.key !== "qwen-image-edit")}>{model.displayName}</option>)}</select></label>
      <label className="block text-sm font-bold">Resolution<select name="resolution" key={modelKey} defaultValue={reuseSelections ? initialRequest?.resolution ?? selected?.defaultResolution : selected?.defaultResolution} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3">{(selected?.resolutions.length ? selected.resolutions : [selected?.defaultResolution ?? "1024x1024"]).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="block text-sm font-bold">Steps<input name="steps" type="number" min="1" max="200" value={accelerationPreset?.settings.numInferenceSteps ?? steps} disabled={faceSwap || accelerationPreset?.settings.numInferenceSteps !== undefined} onChange={(event) => setSteps(Number(event.target.value))} required className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 disabled:bg-[#f1f0eb]" /></label>
      {faceSwap ? <div className="border-t border-[var(--line)] pt-4"><p className="text-sm font-bold">Face-swap LoRAs</p><div className="mt-3 space-y-2">{FACE_SWAP_LORAS.map((lora) => <div key={lora.name} className="grid grid-cols-[minmax(0,1fr)_42px] gap-2 text-xs"><span className="truncate" title={lora.name}>{lora.name.split("/").at(-1)}</span><strong className="text-right">{lora.strength}</strong></div>)}</div></div> : sharpenUnblur ? <div className="border-t border-[var(--line)] pt-4"><p className="text-sm font-bold">Sharpen and Unblur LoRA</p><div className="mt-3 grid grid-cols-[minmax(0,1fr)_42px] gap-2 text-xs"><span className="truncate" title={SHARPEN_UNBLUR_LORA.name}>{SHARPEN_UNBLUR_LORA.name}</span><strong className="text-right">{SHARPEN_UNBLUR_LORA.strength}</strong></div><p className="mt-2 text-[0.68rem] leading-4 text-[var(--muted)]">Other LoRAs are disabled for this preset.</p></div> : <LoraSelector key={modelKey} catalog={selected?.loraCatalog ?? { supported: false, loras: [], reason: "Select a model first." }} initialLoras={reuseSelections ? initialRequest?.loras : undefined} initialPresetId={reuseSelections ? initialRequest?.loraPresetId : undefined} onPresetChange={(next) => { if (next) { previousAccelerationSteps.current = steps; setAccelerationPreset(next); } else { setAccelerationPreset(undefined); setSteps(previousAccelerationSteps.current); } }} />}
      <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-bold">Advanced</summary><label className="mt-4 block text-sm font-bold">Seed<input name="seed" type="number" min="0" max="2147483647" placeholder="Random" defaultValue={initialRequest?.seed} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3" /></label></details>
      <button disabled={submitting || !modelKey || (!file && !sourceUploadId && !sourceAssetId) || (faceSwap && referenceCount !== 1)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 font-bold text-white disabled:opacity-50"><Paintbrush size={18} />{submitting ? "Submitting..." : faceSwap ? "Swap face" : sharpenUnblur ? "Sharpen image" : "Edit image"}</button>
      <p className="flex gap-2 text-xs leading-5 text-[var(--muted)]"><Upload size={15} className="mt-0.5 shrink-0" />Images remain local and are sent to your configured WanGP server.</p>
    </aside>
  </form>;
}