import { PageHeader } from "@/components/ui/page-header";
import { OutputCard } from "@/components/outputs/output-card";
import { ClearOutputsButton } from "@/components/outputs/clear-outputs-button";
import { listOutputs, publicAsset } from "@/lib/runtime/output-registry";

export const dynamic = "force-dynamic";

export default function OutputsPage() {
  const assets = listOutputs().map(publicAsset);
  const firstImageId = assets.find((asset) => asset.type === "image")?.id;
  return <><PageHeader eyebrow="Local Library" title="Outputs" description="Preview, reuse, share, and download media stored on your WanGP computer." action={assets.length ? <ClearOutputsButton /> : undefined} />{assets.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{assets.map((asset) => <OutputCard key={asset.id} asset={asset} priority={asset.id === firstImageId} />)}</div> : <div className="border border-dashed border-[#aeb5ac] bg-[var(--surface)] p-12 text-center text-[var(--muted)]">Completed images and videos will collect here.</div>}</>;
}