"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ClearOutputsButton() {
  const router = useRouter();
  return <button type="button" onClick={async () => {
    if (!window.confirm("Remove all outputs from this app session? WanGP files will remain on disk.")) return;
    const response = await fetch("/api/assets", { method: "DELETE" });
    if (response.ok) router.refresh();
  }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] px-3 text-sm font-bold hover:bg-[#f7e1dc]"><Trash2 size={15} />Clear outputs</button>;
}