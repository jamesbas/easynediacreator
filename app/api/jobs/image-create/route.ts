import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { imageCreateRequestSchema } from "@/lib/requests";
import { createImage } from "@/lib/services/image-create-service";

export async function POST(request: Request) {
  try {
    const input = imageCreateRequestSchema.parse(await request.json());
    return NextResponse.json({ job: await createImage(input) }, { status: 202 });
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Image generation could not be started.";
    return NextResponse.json({ error: message }, { status: error instanceof ZodError ? 400 : 409 });
  }
}