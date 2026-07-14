import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getWanGpClient } from "@/lib/wan-gp";

export async function GET() {
  try {
    const [wanGp, models] = await Promise.all([getWanGpClient().ping(), getModels()]);
    return NextResponse.json({ wanGp, models, defaults: { imageCreate: config.DEFAULT_IMAGE_CREATE_MODEL, imageEdit: config.DEFAULT_IMAGE_EDIT_MODEL, video: config.DEFAULT_VIDEO_MODEL }, limits: { activeJobs: config.MAX_ACTIVE_GENERATION_JOBS, queuedJobs: config.MAX_QUEUED_JOBS, uploadMb: config.MAX_IMAGE_UPLOAD_MB } });
  } catch {
    return NextResponse.json({ error: "WanGP settings are currently unavailable." }, { status: 503 });
  }
}