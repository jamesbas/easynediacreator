"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { LoraAccelerationPreset, LoraCatalog } from "@/lib/types";

type Row = { id: number; name: string; strength: number };

export function LoraSelector({ catalog, onSelectionChange, onPresetChange }: { catalog: LoraCatalog; onSelectionChange?: (loras: { name: string; strength: number }[]) => void; onPresetChange?: (preset?: LoraAccelerationPreset) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [nextId, setNextId] = useState(1);
  const [presetId, setPresetId] = useState("");
  useEffect(() => { onSelectionChange?.(rows.map(({ name, strength }) => ({ name, strength })).filter((lora) => lora.name)); }, [onSelectionChange, rows]);

  if (!catalog.supported) return <div className="border-t border-[var(--line)] pt-4"><p className="text-sm font-bold">LoRAs</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{catalog.reason ?? "LoRA discovery is unavailable for this model."}</p></div>;
  if (!catalog.loras.length) return <div className="border-t border-[var(--line)] pt-4"><p className="text-sm font-bold">LoRAs</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">No compatible LoRAs were returned for this model.</p></div>;
  const presets = catalog.accelerationPresets ?? [];
  const promoted = new Set(presets.flatMap((preset) => preset.loras.map((lora) => lora.filename.toLocaleLowerCase())));
  const otherItems = catalog.items?.filter((item) => !promoted.has(item.filename.toLocaleLowerCase())) ?? catalog.loras.filter((name) => !promoted.has(name.toLocaleLowerCase())).map((filename) => ({ filename, purpose: "unclassified" as const, confidence: "low" as const, compatible: true, evidence: [] }));
  const otherLoras = otherItems.map((item) => item.filename);
  const selectedPreset = presets.find((preset) => preset.id === presetId);
  const selectedPresetSource = selectedPreset?.source === "mcp" ? "Provided by WanGP" : selectedPreset?.source === "user-override" ? "User override" : "Matched WanGP profile";

  return (
    <div className="space-y-4 border-t border-[var(--line)] pt-4">
      <fieldset>
        <legend className="text-sm font-bold">Acceleration presets</legend>
        {presets.length ? <><select aria-label="Acceleration preset" name="loraPresetId" value={presetId} onChange={(event) => { const nextId = event.target.value; const next = presets.find((preset) => preset.id === nextId); setPresetId(nextId); onPresetChange?.(next); }} className="mt-3 min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs"><option value="">None</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>{selectedPreset && <p title={selectedPreset.evidence.map((item) => item.detail).join("; ")} className="mt-2 text-[0.68rem] leading-4 text-[var(--muted)]">{[selectedPreset.settings.numInferenceSteps ? `${selectedPreset.settings.numInferenceSteps} steps` : "", selectedPreset.settings.guidanceScale !== undefined ? `CFG ${selectedPreset.settings.guidanceScale}` : "", selectedPreset.settings.sampleSolver ?? "", `${selectedPreset.loras.length} required LoRA${selectedPreset.loras.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")} · {selectedPresetSource}</p>}</> : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">No high-confidence acceleration preset is installed for this model.</p>}
      </fieldset>
      <fieldset>
      <legend className="text-sm font-bold">Other LoRAs</legend>
      <div className="mt-3 space-y-3">
        {rows.map((row, index) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_74px_40px] gap-2">
            <label className="min-w-0"><span className="sr-only">LoRA {index + 1}</span><select name="loraName" value={row.name} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, name: event.target.value } : item))} className="min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs"><option value="" disabled>Select LoRA</option>{otherItems.map((item) => <option key={item.filename} value={item.filename} disabled={rows.some((rowItem) => rowItem.id !== row.id && rowItem.name === item.filename)}>{item.filename}{item.purpose === "accelerator" ? " (possible accelerator)" : ""}</option>)}</select></label>
            <label><span className="sr-only">LoRA {index + 1} strength</span><input name="loraStrength" aria-label={`${row.name || `LoRA ${index + 1}`} strength`} type="number" min="-10" max="10" step="0.05" value={row.strength} onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, strength: Number(event.target.value) } : item))} className="min-h-10 w-full rounded-md border border-[#b8beb7] bg-white px-2 text-xs" /></label>
            <button type="button" title="Remove LoRA" aria-label={`Remove LoRA ${index + 1}`} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="grid size-10 place-items-center rounded-md border border-[var(--line)] hover:bg-[#f7e1dc]"><Trash2 size={15} /></button>
          </div>
        ))}
        <button type="button" disabled={!otherLoras.length || rows.length >= Math.min(8, otherLoras.length)} onClick={() => { setRows((current) => [...current, { id: nextId, name: otherLoras.find((name) => !current.some((item) => item.name === name)) ?? "", strength: 1 }]); setNextId((value) => value + 1); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] px-3 text-xs font-bold hover:bg-white disabled:opacity-50"><Plus size={15} />Add LoRA</button>
      </div>
      <p className="mt-2 text-[0.68rem] leading-4 text-[var(--muted)]">Strength defaults to 1. Other LoRAs are applied after the acceleration preset in selection order.</p>
      </fieldset>
    </div>
  );
}

export function readLoraSelections(data: FormData) {
  const names = data.getAll("loraName").map(String);
  const strengths = data.getAll("loraStrength").map(Number);
  return names.map((name, index) => ({ name, strength: strengths[index] ?? 1 })).filter((lora) => lora.name);
}