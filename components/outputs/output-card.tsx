import Image from "next/image";
import Link from "next/link";
import type { publicAsset } from "@/lib/runtime/output-registry";
import { AssetActions } from "./asset-actions";

export function OutputCard({ asset, priority = false }: { asset: ReturnType<typeof publicAsset>; priority?: boolean }) {
  return (
    <article className="overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
      <Link href={asset.contentUrl} target="_blank" className="relative block aspect-[4/3] bg-[#e4e1d8]">
        {asset.type === "image" ? <Image src={asset.contentUrl} alt={asset.prompt.slice(0, 120)} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" unoptimized priority={priority} /> : <video src={asset.contentUrl} className="size-full object-cover" muted preload="metadata" />}
      </Link>
      <div className="p-4"><div className="flex items-center justify-between gap-3"><span className="font-mono text-[0.66rem] font-semibold uppercase text-[var(--teal)]">{asset.type} / {asset.modelKey}</span><time className="text-xs text-[var(--muted)]">{new Date(asset.createdAt).toLocaleDateString()}</time></div><p className="mt-3 line-clamp-2 text-sm leading-6">{asset.prompt}</p><AssetActions asset={asset} /></div>
    </article>
  );
}