import { NextResponse } from "next/server";
import { removeCharacterReference } from "@/lib/character-references/storage";

export const runtime = "nodejs";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ references: await removeCharacterReference(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Character reference image could not be removed." }, { status: 400 });
  }
}
