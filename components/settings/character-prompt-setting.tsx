"use client";

import { Save } from "lucide-react";
import { useState } from "react";

export function CharacterPromptSetting({ initialCharacterPrompt }: { initialCharacterPrompt: string }) {
  const [characterPrompt, setCharacterPrompt] = useState(initialCharacterPrompt);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  return <form onSubmit={async (event) => {
    event.preventDefault();
    setSaving(true); setMessage(""); setError("");
    const response = await fetch("/api/settings/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ characterPrompt }) });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) { setError(result.error ?? "Character prompt could not be saved."); return; }
    setCharacterPrompt(result.preferences.characterPrompt);
    setMessage("Character prompt saved.");
  }} className="border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6">
    <label htmlFor="default-character-prompt" className="block text-sm font-bold">Default character prompt</label>
    <textarea id="default-character-prompt" value={characterPrompt} onChange={(event) => { setCharacterPrompt(event.target.value); setMessage(""); }} rows={8} maxLength={4000} className="mt-3 w-full resize-y rounded-md border border-[#b8beb7] bg-white p-4 text-sm leading-6 outline-none focus:border-[var(--teal)] focus:ring-2 focus:ring-[#b5d9d3]" />
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-[var(--muted)]">{characterPrompt.length.toLocaleString()} / 4,000</span>
      <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--teal)] px-4 text-sm font-bold text-white disabled:opacity-60"><Save size={16} />{saving ? "Saving..." : "Save character prompt"}</button>
    </div>
    {message && <p role="status" className="mt-3 text-sm font-semibold text-[var(--teal)]">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--accent)]">{error}</p>}
  </form>;
}