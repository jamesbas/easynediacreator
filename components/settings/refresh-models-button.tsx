"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshModelsButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  return <button type="button" disabled={refreshing} onClick={async () => { setRefreshing(true); try { await fetch("/api/models/refresh", { method: "POST" }); router.refresh(); } finally { setRefreshing(false); } }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold hover:bg-white disabled:opacity-60"><RefreshCw aria-hidden="true" size={16} className={refreshing ? "animate-spin" : ""} />{refreshing ? "Refreshing" : "Refresh models"}</button>;
}