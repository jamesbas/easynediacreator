import { NextResponse } from "next/server";
import { z } from "zod";
import { clearModelCache, getModels } from "@/lib/runtime/model-cache";
import { setModelVisibility } from "@/lib/runtime/model-preferences";

const visibilitySchema = z.object({
  workflowType: z.enum(["image-create", "image-edit", "video-create"]),
  visibleModelTypes: z.array(z.string().min(1).max(200)).max(200),
});

export async function PUT(request: Request) {
  try {
    const input = visibilitySchema.parse(await request.json());
    const availableModelTypes = new Set((await getModels())
      .filter((model) => model.workflowType === input.workflowType && model.availability === "available")
      .map((model) => model.modelType));
    if (input.visibleModelTypes.some((modelType) => !availableModelTypes.has(modelType))) {
      return NextResponse.json({ error: "Select only available models compatible with this workflow." }, { status: 400 });
    }
    const visibility = await setModelVisibility(input.workflowType, input.visibleModelTypes);
    clearModelCache();
    return NextResponse.json({ visibility });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dropdown model visibility could not be saved." }, { status: 400 });
  }
}
