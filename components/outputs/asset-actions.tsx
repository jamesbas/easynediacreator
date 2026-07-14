"use client";

import { Clapperboard, Download, ExternalLink, Paintbrush, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { publicAsset } from "@/lib/runtime/output-registry";

export function AssetActions({ asset }: { asset: ReturnType<typeof publicAsset> }) {
  const router = useRouter();
  const button = "grid size-10 place-items-center rounded-md border border-[var(--line)] hover:bg-[#ebe8df]";
  return <div className="mt-4 flex flex-wrap gap-2"><a className={button} href={asset.contentUrl} target="_blank" title="Open preview" aria-label="Open preview"><ExternalLink size={17} /></a><a className={button} href={`${asset.contentUrl}?download=1`} title="Download original" aria-label="Download original"><Download size={17} /></a><button className={button} type="button" title="Share" aria-label="Share" onClick={async () => { try { const response = await fetch(asset.contentUrl); const blob = await response.blob(); const file = new File([blob], asset.filename, { type: blob.type }); if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Easy Media Generator output" }); else await navigator.share?.({ title: "Easy Media Generator output", url: new URL(asset.contentUrl, window.location.href).href }); } catch {} }}><Share2 size={17} /></button>{asset.type === "image" && <><Link className={button} href={`/edit-image?source=${asset.id}`} title="Edit image" aria-label="Edit image"><Paintbrush size={17} /></Link><Link className={button} href={`/create-video?start=${asset.id}`} title="Use as video start frame" aria-label="Use as video start frame"><Clapperboard size={17} /></Link></>}<button className={button} type="button" title="Remove from outputs" aria-label="Remove from outputs" onClick={async () => { if (!window.confirm("Remove this output from the app? The WanGP file will remain on disk.")) return; const response = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" }); if (response.ok) router.refresh(); }}><Trash2 size={17} /></button></div>;
}