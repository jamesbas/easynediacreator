"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ModelCandidate } from "@/lib/types";

export function ModelSelectionControl({ selectionKey, modelType, candidates }: { selectionKey: string; modelType?: string; candidates: ModelCandidate[] }) {
  const router = useRouter();
  const [value, setValue] = useState(modelType ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return <div className="mt-3 max-w-xl">
    <label className="block text-xs font-bold text-[var(--muted)]">WanGP model
      <select value={value} disabled={saving} onChange={async (event) => {
        const next = event.target.value; setValue(next); setSaving(true); setError("");
        const response = await fetch("/api/settings/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectionKey, modelType: next }) });
        const result = await response.json(); setSaving(false);
        if (!response.ok) { setError(result.error ?? "Model selection could not be saved."); setValue(modelType ?? ""); return; }
        router.refresh();
      }} className="mt-2 min-h-11 w-full rounded-md border border-[#b8beb7] bg-white px-3 text-sm font-normal text-[var(--foreground)] disabled:opacity-60">
        {candidates.map((candidate) => <option key={candidate.modelType} value={candidate.modelType} disabled={candidate.availability !== "available"}>{candidate.name}{candidate.availability !== "available" ? ` (${candidate.availability ?? "unknown"})` : ""}</option>)}
      </select>
    </label>
    {saving && <p className="mt-2 text-xs text-[var(--muted)]">Saving selection...</p>}
    {error && <p role="alert" className="mt-2 text-xs font-semibold text-[var(--accent)]">{error}</p>}
  </div>;
}