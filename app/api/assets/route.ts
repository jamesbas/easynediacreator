import { NextResponse } from "next/server";
import { clearOutputs, listOutputs, publicAsset } from "@/lib/runtime/output-registry";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ assets: listOutputs().map(publicAsset) }); }
export async function DELETE() { return NextResponse.json({ removed: clearOutputs() }); }