import { NextResponse } from "next/server";
import { z } from "zod";
import { loraSelectionSchema } from "@/lib/requests";
import { getAppPreferences, MAX_DEFAULT_LORAS, setAppPreferences } from "@/lib/runtime/app-preferences";
import { getModels } from "@/lib/runtime/model-cache";
import { validateModelLoras } from "@/lib/services/lora-service";

export const runtime = "nodejs";

const updateSchema = z.object({
  selectionKey: z.string().min(1).max(100),
  loras: z.array(loraSelectionSchema).max(MAX_DEFAULT_LORAS),
});

export async function POST(request: Request) {
  try {
    const input = updateSchema.parse(await request.json());
    const model = (await getModels()).find((candidate) => `${candidate.workflowType}:${candidate.key}` === input.selectionKey);
    if (!model) return NextResponse.json({ error: "Select an installed model before saving default LoRAs." }, { status: 400 });
    const names = new Set(input.loras.map((lora) => lora.name.toLocaleLowerCase()));
    if (names.size !== input.loras.length) return NextResponse.json({ error: "Each default LoRA can only be selected once." }, { status: 400 });
    const validated = input.loras.length ? validateModelLoras(input.loras, model.loraCatalog) : [];
    const { defaultLoras } = await getAppPreferences();
    const preferences = await setAppPreferences({ defaultLoras: { ...defaultLoras, [input.selectionKey]: validated } });
    return NextResponse.json({ defaultLoras: preferences.defaultLoras[input.selectionKey] ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Default LoRAs could not be saved." }, { status: 400 });
  }
}
