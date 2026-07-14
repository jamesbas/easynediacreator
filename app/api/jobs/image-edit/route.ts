import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { imageEditRequestSchema } from "@/lib/requests";
import { editImage } from "@/lib/services/image-edit-service";

export async function POST(request: Request) {
  try { return NextResponse.json({ job: await editImage(imageEditRequestSchema.parse(await request.json())) }, { status: 202 }); }
  catch (error) { const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Image editing could not be started."; return NextResponse.json({ error: message }, { status: error instanceof ZodError ? 400 : 409 }); }
}