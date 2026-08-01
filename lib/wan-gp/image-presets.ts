export const FLUX_KLEIN_IMAGE_PRESET = {
  resolutions: ["1024x1024", "1344x768", "768x1344"],
  defaultResolution: "1024x1024",
  defaultSteps: 4,
  memoryProfile: 4.5,
} as const;

export const QWEN_IMAGE_1080P_CHOICES = [
  { label: "1920x1088 (16:9)", value: "1920x1088" },
  { label: "1088x1920 (9:16)", value: "1088x1920" },
  { label: "1440x1440 (1:1)", value: "1440x1440" },
  { label: "1536x1024 (3:2)", value: "1536x1024" },
  { label: "1024x1536 (2:3)", value: "1024x1536" },
  { label: "1920x832 (21:9)", value: "1920x832" },
  { label: "832x1920 (9:21)", value: "832x1920" },
  { label: "2048x768 (8:3)", value: "2048x768" },
  { label: "1024x1792 (4:7)", value: "1024x1792" },
  { label: "1088x1088 (1:1)", value: "1088x1088" },
] as const;

export const QWEN_IMAGE_1080P_RESOLUTIONS = QWEN_IMAGE_1080P_CHOICES.map((choice) => choice.value);

/** Krea 2 publishes `resolutions_categories: ["<=2k"]` rather than a fixed list. */
export const KREA2_IMAGE_CHOICES = [
  { label: "1024x1024 (1:1)", value: "1024x1024" },
  { label: "1408x1024 (11:8)", value: "1408x1024" },
  { label: "1024x1408 (8:11)", value: "1024x1408" },
  { label: "1536x864 (16:9)", value: "1536x864" },
  { label: "864x1536 (9:16)", value: "864x1536" },
  { label: "2048x1152 (16:9)", value: "2048x1152" },
  { label: "1152x2048 (9:16)", value: "1152x2048" },
] as const;

export function getImageFallbackResolutions(modelKey: string) {
  if (modelKey === "qwen-image" || modelKey === "qwen-image-edit") return QWEN_IMAGE_1080P_CHOICES.map((choice) => ({ ...choice }));
  if (modelKey === "krea-2" || modelKey === "krea-2-edit") return KREA2_IMAGE_CHOICES.map((choice) => ({ ...choice }));
  if (modelKey === "flux-klein-9b") return [...FLUX_KLEIN_IMAGE_PRESET.resolutions];
  return [];
}