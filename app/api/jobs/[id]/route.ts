import { NextResponse } from "next/server";
import { getJob } from "@/lib/runtime/job-registry";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; const job = getJob(id); return job ? NextResponse.json({ job }) : NextResponse.json({ error: "Job was not found." }, { status: 404 }); }