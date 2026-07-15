import { PageHeader } from "@/components/ui/page-header";
import { ImageCreateForm } from "@/components/forms/image-create-form";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getAppPreferences } from "@/lib/runtime/app-preferences";
import { FLUX_KLEIN_IMAGE_PRESET } from "@/lib/wan-gp/image-presets";
import { hasGuidanceOneMarker } from "@/lib/wan-gp/image-guidance";

export const dynamic = "force-dynamic";
export default async function CreateImagePage() {
  const preferences = await getAppPreferences();
  let discovered: Awaited<ReturnType<typeof getModels>> = [];
  try { discovered = await getModels(); } catch {}
  const models = discovered.filter((model) => model.workflowType === "image-create").map((model) => {
    const fluxPreset = model.key === "flux-klein-9b" ? FLUX_KLEIN_IMAGE_PRESET : undefined;
    const discoveredResolutions = Array.isArray(model.schema.resolutions) ? model.schema.resolutions.filter((value): value is string => typeof value === "string") : [];
    return {
      key: model.key,
      displayName: model.displayName,
      availability: model.availability,
      reason: model.reason,
      resolutions: fluxPreset ? [...fluxPreset.resolutions] : discoveredResolutions,
      defaultResolution: fluxPreset?.defaultResolution ?? (typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1024x1024"),
      defaultSteps: fluxPreset?.defaultSteps ?? (typeof model.defaults.num_inference_steps === "number" ? model.defaults.num_inference_steps : 20),
      defaultGuidance: typeof model.defaults.guidance_scale === "number" ? model.defaults.guidance_scale : 1,
      guidanceLocked: model.key === "qwen-image" && hasGuidanceOneMarker(model.modelType, model.displayName, model.defaults.type, model.defaults.sample_solver, model.defaults.activated_loras),
      loraCatalog: model.loraCatalog,
    };
  });
  return <><PageHeader eyebrow="Image Studio" title="Create an image" description="Shape a new image from your prompt using an approved local model." /><ImageCreateForm models={models} defaultModel={config.DEFAULT_IMAGE_CREATE_MODEL} characterPrompt={preferences.characterPrompt} /></>;
}