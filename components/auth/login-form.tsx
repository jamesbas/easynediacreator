"use client";

import { LockKeyhole } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const search = useSearchParams(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget); const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: data.get("passcode") }) }); const result = await response.json(); if (!response.ok) { setBusy(false); setError(result.error); return; } const next = search.get("next"); window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/create-image"); }}><label className="block text-sm font-bold">Passcode<input name="passcode" type="password" autoComplete="current-password" required autoFocus className="mt-2 min-h-12 w-full rounded-md border border-[#b8beb7] bg-white px-3" /></label>{error && <p role="alert" className="text-sm font-semibold text-[var(--accent)]">{error}</p>}<button disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[var(--foreground)] font-bold text-white disabled:opacity-50"><LockKeyhole size={17} />{busy ? "Checking..." : "Unlock"}</button></form>;
}