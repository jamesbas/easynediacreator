"use client";

import { Trash2, Upload, UserRoundCheck } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CharacterReferenceSummary } from "@/components/settings/character-reference-images";

export type ReferenceAssetOption = { id: string; filename: string; contentUrl: string };
export type PendingReference = { id: string; file: File; preview: string };
export type ReferenceSelectionState = { files: PendingReference[]; assetIds: string[]; useCharacterReferences: boolean };

export const emptyReferenceSelection: ReferenceSelectionState = { files: [], assetIds: [], useCharacterReferences: false };

export function countReferenceSelection(selection: ReferenceSelectionState, characterReferences: CharacterReferenceSummary[]) {
  return selection.files.length + selection.assetIds.length + (selection.useCharacterReferences ? characterReferences.length : 0);
}

export async function uploadReferenceImage(file: File) {
  const body = new FormData();
  body.set("image", file);
  const response = await fetch("/api/uploads/image", { method: "POST", body });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Image upload failed.");
  return String(result.upload.id);
}

/**
 * Reference images for a generation: saved character photographs, fresh uploads,
 * and previous outputs. WanGP weights the earlier entries of `image_refs` more
 * heavily, which is why the character toggle sits first.
 */
export function ReferenceImagePicker({ assets, characterReferences, selection, onChange, limit, disabledReason }: {
  assets: ReferenceAssetOption[];
  characterReferences: CharacterReferenceSummary[];
  selection: ReferenceSelectionState;
  onChange: (next: ReferenceSelectionState) => void;
  limit: number;
  disabledReason?: string;
}) {
  const previewUrls = useRef(new Set<string>());
  const [error, setError] = useState("");
  const [outputsOpen, setOutputsOpen] = useState(selection.assetIds.length > 0);
  const count = countReferenceSelection(selection, characterReferences);
  const disabled = Boolean(disabledReason);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    setError("");
    const remaining = limit - count;
    if (remaining <= 0) { setError(`Choose no more than ${limit} reference images.`); return; }
    const accepted = incoming.filter((item) => item.type.startsWith("image/")).slice(0, remaining);
    if (!accepted.length) { setError("Choose a valid JPEG, PNG, or WebP image."); return; }
    if (accepted.length !== incoming.length) setError(`Only the first ${limit} reference images were added.`);
    const additions = accepted.map((file) => {
      const preview = URL.createObjectURL(file);
      previewUrls.current.add(preview);
      return { id: crypto.randomUUID(), file, preview };
    });
    onChange({ ...selection, files: [...selection.files, ...additions] });
  }, [count, limit, onChange, selection]);

  const removeFile = (id: string) => {
    onChange({ ...selection, files: selection.files.filter((item) => {
      if (item.id !== id) return true;
      URL.revokeObjectURL(item.preview);
      previewUrls.current.delete(item.preview);
      return false;
    }) });
  };

  return <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-7">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-bold">Reference images</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">People or objects the model should carry into the new image.</p>
      </div>
      <span className="shrink-0 text-xs font-bold text-[var(--muted)]">{count}/{limit}</span>
    </div>

    {characterReferences.length > 0 && <label className={`mt-4 flex items-center justify-between gap-3 border border-[var(--line)] bg-white p-3 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <span className="flex items-center gap-3">
        <span className="flex -space-x-3">{characterReferences.map((reference, index) => <span key={reference.id} className="relative size-10 overflow-hidden rounded-full border-2 border-white bg-[#f6f4ee]"><Image src={`/api/settings/character-references/${reference.id}/content`} alt={`Saved character reference ${index + 1}`} fill sizes="40px" className="object-cover" unoptimized /></span>)}</span>
        <span><span className="flex items-center gap-2 text-sm font-bold"><UserRoundCheck size={17} />Use character references</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{characterReferences.length} saved in Settings.</span></span>
      </span>
      <input type="checkbox" role="switch" checked={selection.useCharacterReferences} disabled={disabled} onChange={(event) => onChange({ ...selection, useCharacterReferences: event.target.checked })} className="size-5 shrink-0 accent-[var(--teal)]" />
    </label>}

    <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!disabled) addFiles([...event.dataTransfer.files]); }} className={`mt-3 flex min-h-28 items-center justify-center border border-dashed border-[#9ca69d] bg-[#f6f4ee] px-4 text-center ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[var(--teal)]"}`}>
      <span><Upload className="mx-auto mb-2 text-[var(--teal)]" size={24} /><strong className="block text-sm">Drop or choose reference images</strong></span>
      <input className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => { addFiles([...(event.target.files ?? [])]); event.target.value = ""; }} />
    </label>

    {selection.files.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {selection.files.map((reference, index) => <div key={reference.id} className="relative aspect-square overflow-hidden border border-[var(--line)] bg-[#f6f4ee]">
        <Image src={reference.preview} alt={`Reference ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 220px" className="object-cover" unoptimized />
        <button type="button" onClick={() => removeFile(reference.id)} title="Remove reference" aria-label={`Remove reference ${index + 1}`} className="absolute right-2 top-2 grid size-9 place-items-center rounded-md bg-white text-[var(--foreground)] shadow-sm"><Trash2 size={16} /></button>
      </div>)}
    </div>}

    {assets.length > 0 && <fieldset className="mt-4" disabled={disabled}>
      <details open={outputsOpen} onToggle={(event) => setOutputsOpen(event.currentTarget.open)} className="border border-[var(--line)] bg-white">
        <summary className="cursor-pointer p-3 text-sm font-bold">Or use image outputs <span className="text-xs font-normal text-[var(--muted)]">({selection.assetIds.length ? `${selection.assetIds.length} selected of ${assets.length}` : `${assets.length} available`})</span></summary>
        <div className="grid max-h-80 gap-2 overflow-y-auto border-t border-[var(--line)] p-3 sm:grid-cols-2">{assets.map((asset) => {
          const checked = selection.assetIds.includes(asset.id);
          return <label key={asset.id} className="flex min-w-0 items-center gap-3 border border-[var(--line)] bg-white p-2 text-xs">
            <input type="checkbox" checked={checked} disabled={!checked && count >= limit} onChange={(event) => onChange({ ...selection, assetIds: event.target.checked ? [...selection.assetIds, asset.id] : selection.assetIds.filter((id) => id !== asset.id) })} />
            <span className="relative size-10 shrink-0 overflow-hidden bg-[#f6f4ee]"><Image src={asset.contentUrl} alt="" fill sizes="40px" className="object-cover" unoptimized /></span>
            <span className="truncate">{asset.filename}</span>
          </label>;
        })}</div>
      </details>
    </fieldset>}

    {disabledReason && <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{disabledReason}</p>}
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
  </section>;
}
