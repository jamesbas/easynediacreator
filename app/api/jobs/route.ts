import { NextResponse } from "next/server";
import { clearFinishedJobs, listJobs } from "@/lib/runtime/job-registry";
import { forgetRuntimeJobs } from "@/lib/services/job-runner";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ jobs: listJobs() }); }
export async function DELETE() { const removedIds = clearFinishedJobs(); forgetRuntimeJobs(removedIds); return NextResponse.json({ removed: removedIds.length, jobs: listJobs() }); }