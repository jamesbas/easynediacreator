import { NextResponse } from "next/server";
import { sessionCookieName } from "@/lib/security/session";
export async function POST(request: Request) { const response = NextResponse.redirect(new URL("/login", request.url)); response.cookies.delete(sessionCookieName); return response; }