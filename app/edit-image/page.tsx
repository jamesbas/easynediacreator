import { PageHeader } from "@/components/ui/page-header";
import { ImageEditForm } from "@/components/forms/image-edit-form";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getJob } from "@/lib/runtime/job-registry";
import { listOutputs, publicAsset } from "@/lib/runtime/output-registry";
import { getGenerationControls } from "@/lib/wan-gp/generation-controls";
import { getImageFallbackResolutions } from "@/lib/wan-gp/image-presets";

export const dynamic = "force-dynamic";
export default async function EditImagePage({ searchParams }: { searchParams: Promise<{ source?: string; fromJob?: string }> }) {
  let discovered: Awaited<ReturnType<typeof getModels>> = [];
  try { discovered = await getModels(); } catch {}
  const models = discovered.filter((model) => model.workflowType === "image-edit").map((model) => ({ key: model.key, displayName: model.displayName, availability: model.availability, controls: getGenerationControls(model.schema, model.defaults, { workflow: "image", fallbackResolutions: model.key === "qwen-image-edit" ? getImageFallbackResolutions(model.key) : [], fallbackResolution: typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1024x1024" }), loraCatalog: model.loraCatalog }));
  const assets = listOutputs().filter((asset) => asset.type === "image").map(publicAsset).map(({ id, filename, contentUrl }) => ({ id, filename, contentUrl }));
  const { source, fromJob } = await searchParams;
  const snapshot = fromJob ? getJob(fromJob)?.requestSnapshot : undefined;
  const initialRequest = snapshot?.workflowType === "image-edit" ? snapshot.request : undefined;
  return <><PageHeader eyebrow="Image Studio" title="Edit an image" description="Upload an image or choose an output, then describe the change you want." /><ImageEditForm models={models} assets={assets} defaultModel={config.DEFAULT_IMAGE_EDIT_MODEL} initialAssetId={assets.some((asset) => asset.id === source) ? source : undefined} initialRequest={initialRequest} /></>;
}