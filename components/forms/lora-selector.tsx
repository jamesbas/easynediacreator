"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LoraCatalog } from "@/lib/types";

type Row = { id: number; name: string; strength: number };

export function LoraSelector({ catalog }: { catalog: LoraCatalog }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [nextId, setNextId] = useState(1);

  if (!catalog.supported) return <div className="border-t border-[var(--line)] pt-4"><p className="text-sm font-bold">LoRAs</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{catalog.reason ?? "LoRA discovery is unavailable for this model."}</p></div>;
  if (!catalog.loras.length) return <div className="border-t border-[var(--line)] pt-4"><p className="text-sm font-bold">LoRAs</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">No compatible LoRAs were returned for this model.</p></div>;

  return (
    <fieldset className="border-t border-[var(--line)] pt-4">
      <legend className="text-sm font-bold">LoRAs</legend>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_74px_40px] gap-2">
            <label className="min-w-0"><span className="sr-only">LoRA {index + 1}</span><select name="loraName" value={row.name} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} className="min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs"><option value="" disabled>Select LoRA</option>{catalog.loras.map((name) => <option key={name} value={name} disabled={rows.some((item) => item.id !== row.id && item.name === name)}>{name}</option>)}</select></label>
            <label><span className="sr-only">LoRA {index + 1} strength</span><input name="loraStrength" aria-label={`${row.name || `LoRA ${index + 1}`} strength`} type="number" min="-10" max="10" step="0.05" value={row.strength} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, strength: Number(event.target.value) } : item))} className="min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs" /></label>
            <button type="button" title="Remove LoRA" aria-label={`Remove LoRA ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="grid size-10 place-items-center rounded-md border border-[var(--line)] hover:bg-[#f7e1dc]"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" disabled={rows.length >= Math.min(8, catalog.loras.length)} onClick={() => { setRows((current) => [...current, { id: nextId, name: catalog.loras.find((name) => !current.some((item) => item.name === name)) ?? "", strength: 1 }]); setNextId((value) => value + 1); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] px-3 text-xs font-bold hover:bg-white disabled:opacity-50"><Plus size={15} />Add LoRA</button>
      </div>
      <p className="mt-2 text-[0.68rem] leading-4 text-[var(--muted)]">Strength defaults to 1. Multiple strengths are passed to WanGP in selection order.</p>
    </fieldset>
  );
}

export function readLoraSelections(data: FormData) {
  const names = data.getAll("loraName").map(String);
  const strengths = data.getAll("loraStrength").map(Number);
  return names.map((name, index) => ({ name, strength: strengths[index] ?? 1 })).filter((lora) => lora.name);
}