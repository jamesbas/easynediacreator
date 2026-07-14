import { NextResponse } from "next/server";
import { getWanGpClient } from "@/lib/wan-gp";

export const runtime = "nodejs";
export async function GET() {
  try {
    const wanGp = await getWanGpClient().ping();
    return NextResponse.json({ status: "ok", app: "easy-media-generator", wanGp });
  } catch {
    return NextResponse.json({ status: "degraded", app: "easy-media-generator", wanGp: { connected: false } }, { status: 503 });
  }
}