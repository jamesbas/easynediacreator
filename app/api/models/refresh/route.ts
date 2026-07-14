import { NextResponse } from "next/server";
import { getModels } from "@/lib/runtime/model-cache";

export async function POST() {
  try { return NextResponse.json({ models: await getModels(true) }); }
  catch { return NextResponse.json({ error: "WanGP model discovery is unavailable." }, { status: 503 }); }
}