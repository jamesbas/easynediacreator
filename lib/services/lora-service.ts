import type { LoraSelection } from "@/lib/requests";
import type { LoraCatalog } from "@/lib/types";

export function validateModelLoras(selected: LoraSelection[], catalog: LoraCatalog) {
  if (!selected.length) return [];
  if (!catalog.supported) throw new Error(catalog.reason ?? "LoRA discovery is not supported by the connected WanGP server.");
  const available = new Map(catalog.loras.map((name) => [name.toLocaleLowerCase(), name]));
  return selected.map((lora) => {
    const canonicalName = available.get(lora.name.toLocaleLowerCase());
    if (!canonicalName) throw new Error(`LoRA '${lora.name}' is not available for the selected model. Refresh models and choose a listed LoRA.`);
    return { ...lora, name: canonicalName };
  });
}