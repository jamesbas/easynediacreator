import { PageHeader } from "@/components/ui/page-header";
import { ImageCreateForm } from "@/components/forms/image-create-form";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";

export const dynamic = "force-dynamic";
export default async function CreateImagePage() {
  let discovered: Awaited<ReturnType<typeof getModels>> = [];
  try { discovered = await getModels(); } catch {}
  const models = discovered.filter((model) => model.workflowType === "image-create").map((model) => ({ key: model.key, displayName: model.displayName, availability: model.availability, reason: model.reason, resolutions: Array.isArray(model.schema.resolutions) ? model.schema.resolutions.filter((value): value is string => typeof value === "string") : [], defaultResolution: typeof model.defaults.resolution === "string" ? model.defaults.resolution : "1024x1024", loraCatalog: model.loraCatalog }));
  return <><PageHeader eyebrow="Image Studio" title="Create an image" description="Shape a new image from your prompt using an approved local model." /><ImageCreateForm models={models} defaultModel={config.DEFAULT_IMAGE_CREATE_MODEL} /></>;
}