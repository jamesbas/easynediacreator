import { NextResponse } from "next/server";
import { getModels } from "@/lib/runtime/model-cache";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ models: await getModels() }); }
  catch { return NextResponse.json({ error: "WanGP model discovery is unavailable." }, { status: 503 }); }
}