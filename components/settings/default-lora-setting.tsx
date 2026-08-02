"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { selectableLoraItems } from "@/components/forms/lora-selector";
import type { LoraCatalog } from "@/lib/types";

type Row = { id: number; name: string; strength: number };

export function DefaultLoraSetting({ selectionKey, catalog, initialLoras }: { selectionKey: string; catalog: LoraCatalog; initialLoras: { name: string; strength: number }[] }) {
  const router = useRouter();
  const items = selectableLoraItems(catalog);
  const available = new Set(items.map((item) => item.filename.toLocaleLowerCase()));
  const [rows, setRows] = useState<Row[]>(() => initialLoras.filter((lora) => available.has(lora.name.toLocaleLowerCase())).map((lora, index) => ({ id: index + 1, ...lora })));
  const [nextId, setNextId] = useState(initialLoras.length + 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (!catalog.supported || !items.length) return <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Default LoRAs: {catalog.reason ?? "no compatible LoRAs are installed for this model."}</p>;

  const update = (rowId: number, changes: Partial<Row>) => {
    setSaved(false);
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, ...changes } : row));
  };

  return <div className="mt-3 max-w-xl">
    <p className="text-xs font-bold text-[var(--muted)]">Default LoRAs</p>
    <p className="mt-1 text-[0.68rem] leading-4 text-[var(--muted)]">Preselected on this model&apos;s generation form. Each job can change the strength, remove them, or add more.</p>
    <div className="mt-3 space-y-2">
      {rows.map((row, index) => (
        <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_74px_40px] gap-2">
          <label className="min-w-0"><span className="sr-only">Default LoRA {index + 1}</span>
            <select value={row.name} onChange={(event) => update(row.id, { name: event.target.value })} className="min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs">
              <option value="" disabled>Select LoRA</option>
              {items.map((item) => <option key={item.filename} value={item.filename} disabled={rows.some((other) => other.id !== row.id && other.name === item.filename)}>{item.filename}{item.purpose === "accelerator" ? " (possible accelerator)" : ""}</option>)}
            </select>
          </label>
          <label><span className="sr-only">Default LoRA {index + 1} strength</span><input aria-label={`${row.name || `Default LoRA ${index + 1}`} strength`} type="number" min="-10" max="10" step="0.05" value={row.strength} onChange={(event) => update(row.id, { strength: Number(event.target.value) })} className="min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs" /></label>
          <button type="button" title="Remove default LoRA" aria-label={`Remove default LoRA ${index + 1}`} onClick={() => { setSaved(false); setRows((current) => current.filter((item) => item.id !== row.id)); }} className="grid size-10 place-items-center rounded-md border border-[var(--line)] hover:bg-[#f7e1dc]"><Trash2 size={15} /></button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={rows.length >= Math.min(8, items.length)} onClick={() => { setSaved(false); setRows((current) => [...current, { id: nextId, name: items.map((item) => item.filename).find((name) => !current.some((row) => row.name === name)) ?? "", strength: 1 }]); setNextId((value) => value + 1); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] px-3 text-xs font-bold hover:bg-white disabled:opacity-50"><Plus size={15} />Add default LoRA</button>
        <button type="button" disabled={saving} onClick={async () => {
          setSaving(true); setError(""); setSaved(false);
          const response = await fetch("/api/settings/default-loras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectionKey, loras: rows.filter((row) => row.name).map(({ name, strength }) => ({ name, strength })) }) });
          const result = await response.json();
          setSaving(false);
          if (!response.ok) { setError(result.error ?? "Default LoRAs could not be saved."); return; }
          setSaved(true);
          router.refresh();
        }} className="inline-flex min-h-10 items-center rounded-md bg-[var(--accent)] px-3 text-xs font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save default LoRAs"}</button>
        {saved && <span className="text-xs text-[var(--teal)]">Saved.</span>}
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-xs font-semibold text-[var(--accent)]">{error}</p>}
  </div>;
}
