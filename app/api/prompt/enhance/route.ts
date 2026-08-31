import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { enhancePrompt, enhancePromptRequestSchema, PromptEnhancementError } from "@/lib/prompt-enhancer/enhance";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // A rewrite occupies the same GPU the renders want, so it is metered like one.
  const rate = checkRateLimit(`enhance:${requestClientKey(request)}`, 20, 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many enhancement requests." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  try {
    const input = enhancePromptRequestSchema.parse(await request.json());
    return NextResponse.json(await enhancePrompt(input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "The request was not valid." }, { status: 400 });
    if (error instanceof PromptEnhancementError) return NextResponse.json({ error: error.message }, { status: error.reason === "not_configured" ? 501 : 502 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The prompt could not be enhanced." }, { status: 500 });
  }
}
