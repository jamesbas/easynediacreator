"use client";

import { ImagePlus, Plus, Save, Trash2, UserRoundPlus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { CHARACTER_GENDERS, MAX_CHARACTERS, MAX_CHARACTER_NAME_LENGTH, MAX_CHARACTER_REFERENCES, type CharacterGender, type CharacterSummary } from "@/lib/character-prompt";

const GENDER_LABELS: Record<CharacterGender, string> = { female: "Female", male: "Male" };

/** Named characters, each with a reusable prompt and up to two reference photographs. */
export function CharacterLibrary({ initialCharacters }: { initialCharacters: CharacterSummary[] }) {
  const [characters, setCharacters] = useState(initialCharacters);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<CharacterGender>("female");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const send = async (request: Promise<Response>, done: string) => {
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await request;
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Characters could not be updated."); return false; }
      setCharacters(result.characters);
      setStatus(done);
      return true;
    } finally {
      setBusy(false);
    }
  };

  return <div className="mt-5 space-y-5">
    {characters.map((character) => <CharacterCard key={character.id} character={character} busy={busy} send={send} />)}

    <form onSubmit={async (event) => {
      event.preventDefault();
      if (await send(fetch("/api/settings/characters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim(), gender: newGender }) }), "Character added.")) setNewName("");
    }} className="flex flex-wrap items-end gap-3 border border-dashed border-[#9ca69d] bg-[#f6f4ee] p-5">
      <label className="min-w-56 flex-1 text-sm font-bold">New character name
        <input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={MAX_CHARACTER_NAME_LENGTH} placeholder="Ada, Marcus, the dog..." required className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 font-normal outline-none focus:border-[var(--teal)]" />
      </label>
      <label className="text-sm font-bold">Gender
        <select value={newGender} onChange={(event) => setNewGender(event.target.value as CharacterGender)} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 font-normal outline-none focus:border-[var(--teal)]">{CHARACTER_GENDERS.map((choice) => <option key={choice} value={choice}>{GENDER_LABELS[choice]}</option>)}</select>
      </label>
      <button type="submit" disabled={busy || characters.length >= MAX_CHARACTERS} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--teal)] px-4 text-sm font-bold text-white disabled:opacity-60"><Plus size={16} />Add character</button>
      <span className="text-xs font-bold text-[var(--muted)]">{characters.length}/{MAX_CHARACTERS}</span>
    </form>

    {status && <p role="status" className="text-sm font-semibold text-[var(--teal)]">{status}</p>}
    {error && <p role="alert" className="text-sm font-semibold text-[var(--accent)]">{error}</p>}
  </div>;
}

function CharacterCard({ character, busy, send }: { character: CharacterSummary; busy: boolean; send: (request: Promise<Response>, done: string) => Promise<boolean>; }) {
  const [name, setName] = useState(character.name);
  const [prompt, setPrompt] = useState(character.prompt);
  const [gender, setGender] = useState<CharacterGender>(character.gender);
  const full = character.references.length >= MAX_CHARACTER_REFERENCES;

  const upload = (file: File) => {
    const body = new FormData();
    body.set("image", file);
    body.set("characterId", character.id);
    return send(fetch("/api/settings/character-references", { method: "POST", body }), "Reference image saved.");
  };

  return <section className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
    <form onSubmit={async (event) => {
      event.preventDefault();
      await send(fetch(`/api/settings/characters/${character.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), prompt, gender }) }), "Character saved.");
    }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-56 flex-1 text-sm font-bold">Character name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={MAX_CHARACTER_NAME_LENGTH} required className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 font-normal outline-none focus:border-[var(--teal)]" />
        </label>
        <label className="text-sm font-bold">Gender
          <select value={gender} onChange={(event) => setGender(event.target.value as CharacterGender)} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 font-normal outline-none focus:border-[var(--teal)]">{CHARACTER_GENDERS.map((choice) => <option key={choice} value={choice}>{GENDER_LABELS[choice]}</option>)}</select>
        </label>
        <button type="button" disabled={busy} onClick={() => { if (confirm(`Delete ${character.name} and its reference images?`)) void send(fetch(`/api/settings/characters/${character.id}`, { method: "DELETE" }), "Character removed."); }} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-bold text-[var(--accent)] disabled:opacity-60"><Trash2 size={16} />Delete</button>
      </div>
      <label className="mt-5 block text-sm font-bold">Character prompt
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={8} maxLength={4000} placeholder="Describe the character's face, build, hair, and wardrobe..." className="mt-2 w-full resize-y rounded-md border border-[#b8beb7] bg-white p-4 text-sm font-normal leading-6 outline-none focus:border-[var(--teal)]" />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--muted)]">{prompt.length.toLocaleString()} / 4,000</span>
        <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--teal)] px-4 text-sm font-bold text-white disabled:opacity-60"><Save size={16} />Save character</button>
      </div>
    </form>

    <div className="mt-6 border-t border-[var(--line)] pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-bold"><UserRoundPlus size={16} />Reference images</h4>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Photographs of this character, most representative first. Turn them on per generation from the Create Image and Edit Image pages.</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-[var(--muted)]">{character.references.length}/{MAX_CHARACTER_REFERENCES}</span>
      </div>
      <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const [file] = [...event.dataTransfer.files].filter((item) => item.type.startsWith("image/")); if (file && !full && !busy) void upload(file); }} className={`mt-4 flex min-h-24 items-center justify-center border border-dashed border-[#9ca69d] bg-[#f6f4ee] px-4 text-center ${full || busy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-[var(--teal)]"}`}>
        <span><ImagePlus className="mx-auto mb-2 text-[var(--teal)]" size={22} /><strong className="block text-sm">{full ? "Remove one to add another" : `Drop or choose an image for ${character.name}`}</strong><span className="mt-1 block text-xs text-[var(--muted)]">JPEG, PNG, or WebP</span></span>
        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || full} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
      </label>
      {character.references.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {character.references.map((reference, index) => <div key={reference.id} className="relative aspect-square overflow-hidden border border-[var(--line)] bg-[#f6f4ee]">
          <Image src={`/api/settings/character-references/${reference.id}/content`} alt={`${character.name} reference ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 220px" className="object-cover" unoptimized />
          <button type="button" disabled={busy} onClick={() => void send(fetch(`/api/settings/character-references/${reference.id}`, { method: "DELETE" }), "Reference image removed.")} title="Remove reference" aria-label={`Remove ${character.name} reference ${index + 1}`} className="absolute right-2 top-2 grid size-9 place-items-center rounded-md bg-white text-[var(--foreground)] shadow-sm disabled:opacity-60"><Trash2 size={16} /></button>
        </div>)}
      </div>}
    </div>
  </section>;
}
