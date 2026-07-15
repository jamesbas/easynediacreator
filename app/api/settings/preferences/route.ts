import { NextResponse } from "next/server";
import { z } from "zod";
import { characterPromptSchema, setAppPreferences } from "@/lib/runtime/app-preferences";

export const runtime = "nodejs";
const updateSchema = z.object({ characterPrompt: characterPromptSchema });

export async function POST(request: Request) {
  try {
    const preferences = await setAppPreferences(updateSchema.parse(await request.json()));
    return NextResponse.json({ preferences });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Application preferences could not be saved." }, { status: 400 });
  }
}