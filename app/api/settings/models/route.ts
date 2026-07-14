import { NextResponse } from "next/server";
import { z } from "zod";
import { clearModelCache, getModels } from "@/lib/runtime/model-cache";
import { setModelSelection } from "@/lib/runtime/model-preferences";

const selectionSchema = z.object({ selectionKey: z.string().min(1).max(100), modelType: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    const input = selectionSchema.parse(await request.json());
    const model = (await getModels()).find((candidate) => `${candidate.workflowType}:${candidate.key}` === input.selectionKey);
    const selected = model?.candidates.find((candidate) => candidate.modelType === input.modelType && candidate.availability === "available");
    if (!model || !selected) return NextResponse.json({ error: "Select an available model compatible with this workflow." }, { status: 400 });
    await setModelSelection(input.selectionKey, input.modelType);
    clearModelCache();
    return NextResponse.json({ models: await getModels(true) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Model selection could not be saved." }, { status: 400 });
  }
}