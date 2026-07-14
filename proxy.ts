import { NextRequest, NextResponse } from "next/server";
import { config as appConfig } from "@/lib/config";
import { checkRateLimit, requestClientKey } from "@/lib/security/rate-limit";
import { sessionCookieName, verifySessionToken } from "@/lib/security/session";

const publicPaths = ["/login", "/api/auth/login", "/api/health"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (["POST", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
    if (origin && forwardedHost && origin !== `${forwardedProto}://${forwardedHost}`) return NextResponse.json({ error: "Cross-origin request denied." }, { status: 403 });
    if (path === "/api/uploads/image") {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > (appConfig.MAX_IMAGE_UPLOAD_MB + 1) * 1024 * 1024) return NextResponse.json({ error: `Image must be smaller than ${appConfig.MAX_IMAGE_UPLOAD_MB} MB.` }, { status: 413 });
    }
    if (path.startsWith("/api/jobs/") && !path.endsWith("/cancel") && !path.endsWith("/retry")) {
      const rate = checkRateLimit(`jobs:${requestClientKey(request)}`, 10, 60_000);
      if (!rate.allowed) return NextResponse.json({ error: "Too many generation requests." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    }
  }
  if (!appConfig.ENABLE_LOCAL_PASSCODE || publicPaths.includes(path)) return NextResponse.next();
  const valid = await verifySessionToken(request.cookies.get(sessionCookieName)?.value, appConfig.LOCAL_PASSCODE_HASH);
  if (valid) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const login = new URL("/login", request.url); login.searchParams.set("next", path); return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };