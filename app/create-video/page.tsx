import { PageHeader } from "@/components/ui/page-header";
import { VideoCreateForm } from "@/components/forms/video-create-form";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getJob } from "@/lib/runtime/job-registry";
import { listOutputs, publicAsset } from "@/lib/runtime/output-registry";
import { getGenerationControls } from "@/lib/wan-gp/generation-controls";
import { getVideoFallbackResolutions } from "@/lib/wan-gp/video-presets";

export const dynamic = "force-dynamic";
export default async function CreateVideoPage({ searchParams }: { searchParams: Promise<{ start?: string; fromJob?: string }> }) {
  let discovered: Awaited<ReturnType<typeof getModels>> = [];
  try { discovered = await getModels(); } catch {}
  const models = discovered.filter((model) => model.workflowType === "video-create").map((model) => {
    const defaultResolution = typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1280x720";
    return { key: model.key, displayName: model.displayName, availability: model.availability, controls: getGenerationControls(model.schema, model.defaults, { workflow: "video", fallbackResolutions: getVideoFallbackResolutions(model.key, defaultResolution), fallbackResolution: defaultResolution }), defaultSourceStrength: typeof model.defaults.input_video_strength === "number" ? model.defaults.input_video_strength : 0.85, supportsEndFrame: model.capabilities.includes("end-frame"), loraCatalog: model.loraCatalog };
  });
  const assets = listOutputs().filter((asset) => asset.type === "image").map(publicAsset).map(({ id, filename, contentUrl }) => ({ id, filename, contentUrl }));
  const { start, fromJob } = await searchParams;
  const snapshot = fromJob ? getJob(fromJob)?.requestSnapshot : undefined;
  const initialRequest = snapshot?.workflowType === "video-create" ? snapshot.request : undefined;
  return <><PageHeader eyebrow="Motion Studio" title="Create a video" description="Animate a start frame with your locally installed LTX-2 model." /><VideoCreateForm models={models} assets={assets} defaultModel={config.DEFAULT_VIDEO_MODEL} initialStartId={assets.some((asset) => asset.id === start) ? start : undefined} initialRequest={initialRequest} /></>;
}