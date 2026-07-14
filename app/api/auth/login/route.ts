import { verify } from "@node-rs/argon2";
import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";
import { createSessionToken, sessionCookieName, sessionMaxAge } from "@/lib/security/session";

const schema = z.object({ passcode: z.string().min(1).max(256) });
export async function POST(request: Request) {
  if (!config.ENABLE_LOCAL_PASSCODE) return NextResponse.json({ ok: true });
  const rate = checkRateLimit(`login:${requestClientKey(request)}`, 5, 15 * 60_000);
  if (!rate.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  try {
    const { passcode } = schema.parse(await request.json());
    if (!await verify(config.LOCAL_PASSCODE_HASH, passcode)) return NextResponse.json({ error: "Passcode is incorrect." }, { status: 401 });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(sessionCookieName, await createSessionToken(config.LOCAL_PASSCODE_HASH), { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "strict", maxAge: sessionMaxAge, path: "/" });
    return response;
  } catch { return NextResponse.json({ error: "Passcode is incorrect." }, { status: 401 }); }
}