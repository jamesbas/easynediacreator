import { PageHeader } from "@/components/ui/page-header";
import { VideoCreateForm } from "@/components/forms/video-create-form";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getAppPreferences, characterSummaries } from "@/lib/runtime/app-preferences";
import { getJob } from "@/lib/runtime/job-registry";
import { listOutputs, publicAsset } from "@/lib/runtime/output-registry";
import { getGenerationControls } from "@/lib/wan-gp/generation-controls";
import { getVideoFallbackResolutions } from "@/lib/wan-gp/video-presets";

export const dynamic = "force-dynamic";
export default async function CreateVideoPage({ searchParams }: { searchParams: Promise<{ start?: string; fromJob?: string }> }) {
  const preferences = await getAppPreferences();
  let discovered: Awaited<ReturnType<typeof getModels>> = [];
  try { discovered = await getModels(); } catch {}
  const models = discovered.filter((model) => model.workflowType === "video-create").map((model, index) => {
    const defaultResolution = typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1280x720";
    const sourceStrength = model.defaults.input_video_strength ?? model.defaults.source_strength ?? model.defaults.denoising_strength;
    return { key: model.key, displayName: model.displayName, availability: model.availability, controls: getGenerationControls(model.schema, model.defaults, { workflow: "video", fallbackResolutions: getVideoFallbackResolutions(model.modelType ?? model.key, defaultResolution), fallbackResolution: defaultResolution }), defaultSourceStrength: typeof sourceStrength === "number" ? sourceStrength : 0.85, supportsSourceStrength: typeof sourceStrength === "number", supportsNegativePrompt: Object.hasOwn(model.defaults, "negative_prompt"), supportsStartFrame: model.capabilities.includes("start-frame"), requiresStartFrame: !model.capabilities.includes("text-to-video"), supportsEndFrame: model.capabilities.includes("end-frame"), loraCatalog: model.loraCatalog, defaultLoras: preferences.defaultLoras[`video-create:${model.key}`] ?? (index === 0 && model.modelType?.toLowerCase().startsWith("ltx2") ? preferences.defaultLoras["video-create:ltx-2"] ?? [] : []) };
  });
  const assets = listOutputs().filter((asset) => asset.type === "image").map(publicAsset).map(({ id, filename, contentUrl }) => ({ id, filename, contentUrl }));
  const { start, fromJob } = await searchParams;
  const snapshot = fromJob ? getJob(fromJob)?.requestSnapshot : undefined;
  const initialRequest = snapshot?.workflowType === "video-create" ? snapshot.request : undefined;
  const defaultModel = models.some((model) => model.key === config.DEFAULT_VIDEO_MODEL) ? config.DEFAULT_VIDEO_MODEL : models[0]?.key ?? "";
  return <><PageHeader eyebrow="Motion Studio" title="Create a video" description="Generate from text or animate images with any locally available WanGP video model." /><VideoCreateForm models={models} assets={assets} defaultModel={defaultModel} characters={characterSummaries(preferences.characters)} initialStartId={assets.some((asset) => asset.id === start) ? start : undefined} initialRequest={initialRequest} /></>;
}