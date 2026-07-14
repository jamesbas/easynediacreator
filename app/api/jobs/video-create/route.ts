import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { videoCreateRequestSchema } from "@/lib/requests";
import { createVideo } from "@/lib/services/video-create-service";

export async function POST(request: Request) {
  try { return NextResponse.json({ job: await createVideo(videoCreateRequestSchema.parse(await request.json())) }, { status: 202 }); }
  catch (error) { const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Video generation could not be started."; return NextResponse.json({ error: message }, { status: error instanceof ZodError ? 400 : 409 }); }
}