import type { GenerationSummary } from "@/lib/types";

const chip = "inline-flex items-center rounded-sm border border-[var(--line)] bg-[#f1efe7] px-2 py-0.5 font-mono text-[0.65rem] leading-5 text-[var(--muted)]";
const loraChip = "inline-flex items-center rounded-sm border border-[#bcd7d2] bg-[#dcece8] px-2 py-0.5 font-mono text-[0.65rem] leading-5 text-[var(--teal)]";

function loraLabel(name: string) {
  const file = name.split(/[\\/]/).pop() ?? name;
  return file.replace(/\.(safetensors|sft|pt|pth|ckpt|bin)$/i, "");
}

export function GenerationSummaryChips({ summary, modelKey, className = "" }: { summary?: GenerationSummary; modelKey: string; className?: string }) {
  const model = summary?.modelLabel ?? modelKey;
  const loras = summary?.loras ?? [];
  return (
    <ul aria-label="Generation settings" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <li className={chip} title={`Model: ${model}`}>{model}</li>
      {summary?.resolution && <li className={chip} title={`Resolution: ${summary.resolution}`}>{summary.resolution}</li>}
      {summary?.steps !== undefined && <li className={chip} title={`Inference steps: ${summary.steps}`}>{summary.steps} steps</li>}
      {loras.map((lora) => <li key={lora.name} className={loraChip} title={`LoRA: ${lora.name} at strength ${lora.strength}`}>{loraLabel(lora.name)} &times; {lora.strength}</li>)}
      {summary && !loras.length && <li className={chip} title="No LoRAs were applied">no LoRAs</li>}
    </ul>
  );
}
