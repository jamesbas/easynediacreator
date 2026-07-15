import { z } from "zod";

export const DEFAULT_NEGATIVE_PROMPT = "blurry, low resolution, pixelated, compression artifacts, deformed anatomy, distorted face, malformed hands, extra limbs, extra fingers, missing fingers, fused fingers, warped proportions, duplicate subjects, text, watermark, logo";

export const loraSelectionSchema = z.object({
  name: z.string().trim().min(1).max(255).refine((value) => !value.includes("/") && !value.includes("\\") && value !== "." && value !== "..", "LoRA must be an available filename."),
  strength: z.number().finite().min(-10).max(10).default(1),
});

const baseGenerationSchema = z.object({
  prompt: z.string().trim().min(1, "Enter a prompt.").max(4000),
  negativePrompt: z.string().trim().max(4000).default(DEFAULT_NEGATIVE_PROMPT),
  modelKey: z.string().min(1),
  resolution: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  loraPresetId: z.string().trim().min(1).max(100).optional(),
  loras: z.array(loraSelectionSchema).max(8).default([]).superRefine((loras, context) => {
    const seen = new Set<string>();
    loras.forEach((lora, index) => {
      const key = lora.name.toLocaleLowerCase();
      if (seen.has(key)) context.addIssue({ code: "custom", path: [index, "name"], message: `LoRA '${lora.name}' was selected more than once.` });
      seen.add(key);
    });
  }),
  advanced: z.record(z.string(), z.unknown()).default({}),
});

export const imageCreateRequestSchema = baseGenerationSchema.extend({
  aspectRatio: z.string().max(20).optional(),
  count: z.number().int().min(1).max(4).default(1),
  steps: z.number().int().min(1).max(200).default(20),
  guidanceScale: z.number().finite().min(0).max(30).optional(),
});

export type ImageCreateRequest = z.infer<typeof imageCreateRequestSchema>;

export const imageEditRequestSchema = baseGenerationSchema.extend({
  sourceUploadId: z.string().uuid().optional(),
  sourceAssetId: z.string().uuid().optional(),
  referenceUploadIds: z.array(z.string().uuid()).max(8).default([]),
  referenceAssetIds: z.array(z.string().uuid()).max(8).default([]),
  faceSwap: z.boolean().default(false),
  steps: z.number().int().min(1).max(200).default(20),
}).superRefine((value, context) => {
  if (Boolean(value.sourceUploadId) === Boolean(value.sourceAssetId)) context.addIssue({ code: "custom", message: "Choose exactly one source image." });
  const referenceCount = value.referenceUploadIds.length + value.referenceAssetIds.length;
  if (referenceCount > 8) context.addIssue({ code: "custom", path: ["referenceUploadIds"], message: "Choose no more than 8 reference images." });
  if (value.faceSwap && value.modelKey !== "qwen-image-edit") context.addIssue({ code: "custom", path: ["modelKey"], message: "Face swap requires Qwen Image Edit." });
  if (value.faceSwap && referenceCount !== 1) context.addIssue({ code: "custom", path: ["referenceUploadIds"], message: "Face swap requires exactly one reference image." });
  if (value.faceSwap && value.loras.length) context.addIssue({ code: "custom", path: ["loras"], message: "Face swap manages its required LoRAs automatically." });
});

export type ImageEditRequest = z.infer<typeof imageEditRequestSchema>;

export const videoCreateRequestSchema = baseGenerationSchema.extend({
  startUploadId: z.string().uuid().optional(), startAssetId: z.string().uuid().optional(),
  endUploadId: z.string().uuid().optional(), endAssetId: z.string().uuid().optional(),
  durationSeconds: z.number().int().min(1).max(20).default(15), fps: z.number().int().min(1).max(120).optional(), sourceStrength: z.number().finite().min(0).max(1).default(0.85), steps: z.number().int().min(1).max(200).optional(),
}).refine((value) => Boolean(value.startUploadId) !== Boolean(value.startAssetId), { message: "Choose exactly one start image." })
  .refine((value) => !(value.endUploadId && value.endAssetId), { message: "Choose only one end image." });

export type VideoCreateRequest = z.infer<typeof videoCreateRequestSchema>;
export type LoraSelection = z.infer<typeof loraSelectionSchema>;