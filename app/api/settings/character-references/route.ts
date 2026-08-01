import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { addCharacterReference, listCharacterReferences } from "@/lib/character-references/storage";
import { logger } from "@/lib/telemetry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ references: await listCharacterReferences() });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
    if (file.size > config.MAX_IMAGE_UPLOAD_MB * 1024 * 1024) return NextResponse.json({ error: `Image must be smaller than ${config.MAX_IMAGE_UPLOAD_MB} MB.` }, { status: 413 });
    const reference = await addCharacterReference(Buffer.from(await file.arrayBuffer()));
    logger.info({ event: "character-reference.added", referenceId: reference.id }, "Character reference image saved");
    return NextResponse.json({ references: await listCharacterReferences() }, { status: 201 });
  } catch (error) {
    logger.warn({ event: "character-reference.rejected", error }, "Character reference image rejected");
    return NextResponse.json({ error: error instanceof Error ? error.message : "Character reference image could not be saved." }, { status: 400 });
  }
}
