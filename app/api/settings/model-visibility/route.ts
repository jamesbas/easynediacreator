import { NextResponse } from "next/server";
import { z } from "zod";
import { clearModelCache } from "@/lib/runtime/model-cache";
import { setModelVisibility } from "@/lib/runtime/model-preferences";

const visibilitySchema = z.object({
  workflowType: z.enum(["image-create", "image-edit", "video-create"]),
  visibleModelTypes: z.array(z.string().min(1).max(200)).max(200),
});

export async function PUT(request: Request) {
  try {
    const input = visibilitySchema.parse(await request.json());
    const visibility = await setModelVisibility(input.workflowType, input.visibleModelTypes);
    clearModelCache();
    return NextResponse.json({ visibility });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dropdown model visibility could not be saved." }, { status: 400 });
  }
}
