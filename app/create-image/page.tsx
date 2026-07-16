import { PageHeader } from "@/components/ui/page-header";
import { ImageCreateForm } from "@/components/forms/image-create-form";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getAppPreferences } from "@/lib/runtime/app-preferences";
import { getJob } from "@/lib/runtime/job-registry";
import { FLUX_KLEIN_IMAGE_PRESET, getImageFallbackResolutions } from "@/lib/wan-gp/image-presets";
import { hasGuidanceOneMarker } from "@/lib/wan-gp/image-guidance";
import { getGenerationControls } from "@/lib/wan-gp/generation-controls";

export const dynamic = "force-dynamic";
export default async function CreateImagePage({ searchParams }: { searchParams: Promise<{ fromJob?: string }> }) {
  const preferences = await getAppPreferences();
  let discovered: Awaited<ReturnType<typeof getModels>> = [];
  try { discovered = await getModels(); } catch {}
  const models = discovered.filter((model) => model.workflowType === "image-create").map((model) => {
    const fluxPreset = model.key === "flux-klein-9b" ? FLUX_KLEIN_IMAGE_PRESET : undefined;
    const controlDefaults = fluxPreset ? { ...model.defaults, resolution: fluxPreset.defaultResolution, num_inference_steps: fluxPreset.defaultSteps } : model.defaults;
    const controls = getGenerationControls(model.schema, controlDefaults, { workflow: "image", fallbackResolutions: getImageFallbackResolutions(model.key), fallbackResolution: fluxPreset?.defaultResolution ?? (typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1024x1024") });
    return {
      key: model.key,
      displayName: model.displayName,
      availability: model.availability,
      reason: model.reason,
      controls,
      guidanceLocked: model.key === "qwen-image" && hasGuidanceOneMarker(model.modelType, model.displayName, model.defaults.type, model.defaults.sample_solver, model.defaults.activated_loras),
      loraCatalog: model.loraCatalog,
    };
  });
  const { fromJob } = await searchParams;
  const snapshot = fromJob ? getJob(fromJob)?.requestSnapshot : undefined;
  const initialRequest = snapshot?.workflowType === "image-create" ? snapshot.request : undefined;
  return <><PageHeader eyebrow="Image Studio" title="Create an image" description="Shape a new image from your prompt using an approved local model." /><ImageCreateForm models={models} defaultModel={config.DEFAULT_IMAGE_CREATE_MODEL} characterPrompt={preferences.characterPrompt} initialRequest={initialRequest} /></>;
}