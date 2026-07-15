import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getAppPreferences } from "@/lib/runtime/app-preferences";
import { getWanGpClient } from "@/lib/wan-gp";

export async function GET() {
  const preferences = await getAppPreferences();
  try {
    const [wanGp, models] = await Promise.all([getWanGpClient().ping(), getModels()]);
    return NextResponse.json({ wanGp, models, preferences, defaults: { imageCreate: config.DEFAULT_IMAGE_CREATE_MODEL, imageEdit: config.DEFAULT_IMAGE_EDIT_MODEL, video: config.DEFAULT_VIDEO_MODEL }, limits: { activeJobs: config.MAX_ACTIVE_GENERATION_JOBS, queuedJobs: config.MAX_QUEUED_JOBS, uploadMb: config.MAX_IMAGE_UPLOAD_MB } });
  } catch {
    return NextResponse.json({ error: "WanGP settings are currently unavailable.", preferences }, { status: 503 });
  }
}