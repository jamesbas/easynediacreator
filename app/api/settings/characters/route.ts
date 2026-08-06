import { NextResponse } from "next/server";
import { z } from "zod";
import { createCharacter, listCharacters } from "@/lib/characters/storage";
import { characterGenderSchema, characterNameSchema, characterPromptSchema, characterSummaries } from "@/lib/runtime/app-preferences";

export const runtime = "nodejs";

const createSchema = z.object({ name: characterNameSchema, prompt: characterPromptSchema.optional(), gender: characterGenderSchema.optional() });

export async function GET() {
  return NextResponse.json({ characters: characterSummaries(await listCharacters()) });
}

export async function POST(request: Request) {
  try {
    await createCharacter(createSchema.parse(await request.json()));
    return NextResponse.json({ characters: characterSummaries(await listCharacters()) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Character could not be created." }, { status: 400 });
  }
}
