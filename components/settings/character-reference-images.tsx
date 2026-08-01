"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { MAX_CHARACTER_REFERENCES } from "@/lib/character-prompt";

export type CharacterReferenceSummary = { id: string; width: number; height: number };

export function CharacterReferenceImages({ initialReferences }: { initialReferences: CharacterReferenceSummary[] }) {
  const [references, setReferences] = useState(initialReferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (request: Promise<Response>) => {
    setBusy(true); setError("");
    const response = await request;
    const result = await response.json();
    setBusy(false);
    if (!response.ok) { setError(result.error ?? "Character reference images could not be updated."); return; }
    setReferences(result.references);
  };

  const upload = (file: File) => {
    const body = new FormData();
    body.set("image", file);
    return send(fetch("/api/settings/character-references", { method: "POST", body }));
  };

  return <section className="mt-5 border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-bold">Character reference images</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Photographs of the same character, most representative first. Turn them on per generation from the Create Image and Edit Image pages.</p>
      </div>
      <span className="shrink-0 text-xs font-bold text-[var(--muted)]">{references.length}/{MAX_CHARACTER_REFERENCES}</span>
    </div>
    <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const [file] = [...event.dataTransfer.files].filter((item) => item.type.startsWith("image/")); if (file) void upload(file); }} className={`mt-4 flex min-h-28 items-center justify-center border border-dashed border-[#9ca69d] bg-[#f6f4ee] px-4 text-center ${references.length >= MAX_CHARACTER_REFERENCES || busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[var(--teal)]"}`}>
      <span><ImagePlus className="mx-auto mb-2 text-[var(--teal)]" size={24} /><strong className="block text-sm">{references.length >= MAX_CHARACTER_REFERENCES ? "Remove one to add another" : "Drop or choose a reference image"}</strong><span className="mt-1 block text-xs text-[var(--muted)]">JPEG, PNG, or WebP</span></span>
      <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || references.length >= MAX_CHARACTER_REFERENCES} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    </label>
    {references.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {references.map((reference, index) => <div key={reference.id} className="relative aspect-square overflow-hidden border border-[var(--line)] bg-[#f6f4ee]">
        <Image src={`/api/settings/character-references/${reference.id}/content`} alt={`Character reference ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 220px" className="object-cover" unoptimized />
        <button type="button" disabled={busy} onClick={() => void send(fetch(`/api/settings/character-references/${reference.id}`, { method: "DELETE" }))} title="Remove reference" aria-label={`Remove character reference ${index + 1}`} className="absolute right-2 top-2 grid size-9 place-items-center rounded-md bg-white text-[var(--foreground)] shadow-sm disabled:opacity-60"><Trash2 size={16} /></button>
      </div>)}
    </div>}
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
  </section>;
}
