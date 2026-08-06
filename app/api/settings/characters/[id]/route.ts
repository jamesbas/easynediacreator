import { NextResponse } from "next/server";
import { z } from "zod";
import { listCharacters, removeCharacter, updateCharacter } from "@/lib/characters/storage";
import { characterGenderSchema, characterNameSchema, characterPromptSchema, characterSummaries } from "@/lib/runtime/app-preferences";

export const runtime = "nodejs";

const updateSchema = z.object({ name: characterNameSchema.optional(), prompt: characterPromptSchema.optional(), gender: characterGenderSchema.optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await updateCharacter(id, updateSchema.parse(await request.json()));
    return NextResponse.json({ characters: characterSummaries(await listCharacters()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Character could not be saved." }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ characters: characterSummaries(await removeCharacter(id)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Character could not be removed." }, { status: 400 });
  }
}
