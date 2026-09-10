import { z } from "zod";
import { getModels } from "@/lib/runtime/model-cache";
import { logger } from "@/lib/telemetry";
import { exclusionDirective, imagePromptDirective, videoPromptDirective } from "./directives";
import { familyOfModelType, type PromptFamily } from "./family";
import { appendAudioProse, isH3Prompt, ref2vaFallbackDeclarations, renderH3Prompt, renderRef2vaPrompt, stripH3Envelope, usesH3PromptFormat, usesRef2vaPromptFormat } from "./h3-prompt";
import { resolveEnhancerImages, type EnhancerImage } from "./images";
import { completeJson, isPromptEnhancerConfigured, type EnhancerFailure } from "./lm-studio";

export const MAX_ENHANCED_PROMPT_CHARS = 4000;
/** Leaves room for H3's alignment line and three field labels inside the limit. */
const TIMELINE_BUDGET_CHARS = 3200;
/** Ref2VA spends the rest of the limit on its three declaration sections. */
const REFERENCE_TIMELINE_BUDGET_CHARS = 2400;

const imageId = z.string().uuid();

export const enhancePromptRequestSchema = z.object({
  workflowType: z.enum(["image-create", "image-edit", "video-create"]),
  modelKey: z.string().min(1).max(200),
  prompt: z.string().trim().min(1, "Write a prompt before enhancing it.").max(MAX_ENHANCED_PROMPT_CHARS),
  durationSeconds: z.number().int().min(1).max(3600).default(15),
  hasStartFrame: z.boolean().default(false),
  hasEndFrame: z.boolean().default(false),
  hasSourceImage: z.boolean().default(false),
  referenceCount: z.number().int().min(0).max(8).default(0),
  // The same handles the generation requests use, so a rewrite can look at the
  // very pictures the render will be given. Never a path.
  startUploadId: imageId.optional(),
  startAssetId: imageId.optional(),
  endUploadId: imageId.optional(),
  endAssetId: imageId.optional(),
  sourceUploadId: imageId.optional(),
  sourceAssetId: imageId.optional(),
  referenceUploadIds: z.array(imageId).max(8).optional(),
  referenceAssetIds: z.array(imageId).max(8).optional(),
  characterReferenceIds: z.array(imageId).max(8).optional(),
});
export type EnhancePromptRequest = z.infer<typeof enhancePromptRequestSchema>;

const simpleShape = z.object({ prompt: z.string().trim().min(1) });
const layeredShape = simpleShape.extend({ soundscape: z.string().trim().optional(), score: z.string().trim().optional() });
const referenceShape = layeredShape.extend({ subjects: z.string().trim().optional(), summary: z.string().trim().optional(), retention: z.string().trim().optional() });
const simpleJsonSchema = { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"], additionalProperties: false };
const layeredJsonSchema = {
  type: "object",
  properties: { prompt: { type: "string" }, soundscape: { type: "string" }, score: { type: "string" } },
  required: ["prompt", "soundscape", "score"],
  additionalProperties: false,
};
const referenceJsonSchema = {
  type: "object",
  properties: { subjects: { type: "string" }, summary: { type: "string" }, retention: { type: "string" }, prompt: { type: "string" }, soundscape: { type: "string" }, score: { type: "string" } },
  required: ["subjects", "summary", "retention", "prompt", "soundscape", "score"],
  additionalProperties: false,
};

/** Which answer shape the family's envelope needs back from the language model. */
type EnhancerMode = "plain" | "layered" | "reference";

/**
 * The rules that hold whatever renders the prompt.
 *
 * A text encoder has no operator for "no": it embeds the phrase whole and the
 * noun does the work by accident, so "no sharp edges" draws sharp edges. The
 * other three are the mistakes a language model makes unprompted — it explains
 * itself, it invents a new subject, and it names a feeling the renderer cannot
 * draw.
 */
const BASE_SYSTEM = [
  "You rewrite prompts for a locally hosted WanGP generation studio. You are given one short prompt and you return one fully specified prompt for the exact model that will render it.",
  "Keep the user's subject, action, setting and intent. Add specificity; never add a new story, a new character or a new location.",
  "Say what is present, never what is absent. A text encoder has no operator for \"no\" — \"no clutter\" renders clutter — so write the thing to show instead.",
  "Describe what is seen rather than naming a feeling: \"her jaw tightens\", not \"she looks angry\".",
  "Do not invent readable text, signs, logos or watermarks unless the user asked for them.",
  "Reproduce verbatim anything the user put in quotation marks, and keep every proper name they used.",
  "Answer with JSON only. No preamble, no explanation, no markdown.",
].join(" ");

function workflowDirective(input: EnhancePromptRequest) {
  if (input.workflowType === "video-create") {
    const frames = input.hasStartFrame && input.hasEndFrame
      ? "A start frame and an end frame are attached, and they already fix how the shot opens and closes, so write the path between them rather than the endpoints."
      : input.hasStartFrame
        ? "A start frame is attached and already fixes the opening composition, so open at what it shows and write only what changes from there."
        : input.hasEndFrame
          ? "An end frame is attached and already fixes the closing composition, so write how the shot arrives at it."
          : "There is no keyframe, so the opening composition has to come from the prompt.";
    return `You are writing the prompt for a ${input.durationSeconds}-second video clip. Write motion, staging and camera — what changes over those seconds and how. ${frames}`;
  }
  if (input.workflowType === "image-edit") {
    return input.hasSourceImage
      ? "You are writing an edit instruction applied to a picture the user already has. Say what changes and what must stay exactly as it is. Do not describe the whole picture from scratch — the model can already see it — and keep the instruction to the edit itself."
      : "You are writing a still-image prompt. No source picture is attached, so describe the whole frame: subject, setting, composition, light and finish.";
  }
  return "You are writing a still-image prompt: subject, setting, composition, light and finish.";
}

function referenceDirective(count: number) {
  if (!count) return "";
  return `${count} reference image${count === 1 ? " is" : "s are"} attached to condition the render. Name the people or objects they show and what they must do in this frame, but do not describe their faces in detail — the photograph carries the likeness and a written face competes with it.`;
}

/**
 * Told only when the model can actually see the pictures.
 *
 * The risk with vision here is not that the model sees too little but that it
 * writes a caption: an accurate description of the attached frame is not a
 * prompt for the clip that follows it.
 */
const VISION_DIRECTIVE = "The images named below this message are attached and you can see them. Ground the rewrite in what they actually show — the setting, the people, their wardrobe, the props, the light and the framing — instead of inventing details or leaving them vague. Follow the stated role of each image; a reference is not a frame of the output. Do not caption the pictures back: what you return is the instruction for what to render, not a description of what is attached, and anything already fixed by an attached frame needs naming only where it bears on what changes.";

function buildSystemPrompt(input: EnhancePromptRequest, family: PromptFamily, mode: EnhancerMode, images: EnhancerImage[]) {
  const parts = [
    BASE_SYSTEM,
    workflowDirective(input),
    // Ref2VA's own directive says what every attached picture is and where it
    // may be named, so the generic reference note would only contradict it.
    mode === "reference" ? "" : referenceDirective(input.referenceCount),
    images.length ? VISION_DIRECTIVE : "",
    input.workflowType === "video-create"
      ? videoPromptDirective(family, input.durationSeconds, { hasStartFrame: input.hasStartFrame, hasEndFrame: input.hasEndFrame, referenceCount: input.referenceCount })
      : imagePromptDirective(family),
    exclusionDirective(family),
    mode === "reference"
      ? `Return JSON with six string keys: "subjects", "summary", "retention", "prompt" and the two audio keys, each holding only the body of its section without its label. "subjects" and "retention" must carry one line for every attached picture listed above, and may be "" only when none was attached. "prompt" is the detailed_description timeline and holds any spoken lines. "soundscape" is one to four sentences of ambience and physical sound, never dialogue and never music. "score" is one to three sentences of audience-only music given as instrumentation, tempo and how it develops, or exactly "N/A" where the scene should carry none. Keep "prompt" under ${REFERENCE_TIMELINE_BUDGET_CHARS} characters.`
      : mode === "layered"
        ? `Return JSON with three string keys. "prompt" is the shot timeline and holds any spoken lines. "soundscape" is one to four sentences of ambience and physical sound, never dialogue and never music. "score" is one to three sentences of audience-only music given as instrumentation, tempo and how it develops, or exactly "N/A" where the scene should carry none. Keep "prompt" under ${TIMELINE_BUDGET_CHARS} characters.`
        : `Return JSON with one string key, "prompt", holding the rewritten prompt and nothing else. Keep it under ${TIMELINE_BUDGET_CHARS} characters.`,
  ];
  return parts.filter(Boolean).join("\n\n");
}

function buildUserPrompt(input: EnhancePromptRequest) {
  return `Prompt to rewrite:\n${stripH3Envelope(input.prompt)}`;
}

/** Trims to the limit at a sentence boundary, so a rewrite is never cut mid-clause. */
export function clampPrompt(text: string, limit = MAX_ENHANCED_PROMPT_CHARS) {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  const head = trimmed.slice(0, limit);
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (sentenceEnd > limit * 0.6) return head.slice(0, sentenceEnd + 1).trim();
  const wordEnd = head.lastIndexOf(" ");
  return (wordEnd > 0 ? head.slice(0, wordEnd) : head).trim();
}

const FAILURE_MESSAGES: Record<EnhancerFailure, string> = {
  not_configured: "Prompt enhancement is not configured. Set LM_STUDIO_BASE_URL to your LM Studio server.",
  no_model: "No model is loaded in LM Studio. Load one, or pin it with LM_STUDIO_MODEL.",
  request_failed: "LM Studio could not be reached.",
  empty_response: "The language model returned nothing.",
  unparseable_json: "The language model did not answer in the expected format.",
  schema_mismatch: "The language model answered in the wrong shape.",
};

export class PromptEnhancementError extends Error {
  constructor(readonly reason: EnhancerFailure, detail: string) {
    super(`${FAILURE_MESSAGES[reason]} ${detail}`.trim());
  }
}

/** The checkpoint that will render this, so the prompt is written for the right family. */
async function resolveModelType(workflowType: EnhancePromptRequest["workflowType"], modelKey: string) {
  try {
    const model = (await getModels()).find((candidate) => candidate.workflowType === workflowType && candidate.key === modelKey);
    if (model?.modelType) return model.modelType;
  } catch {
    // An unreachable WanGP is not a reason to refuse the rewrite; it only costs
    // the family-specific guidance, and video keys are the model type already.
  }
  return modelKey;
}

export async function enhancePrompt(input: EnhancePromptRequest) {
  if (!isPromptEnhancerConfigured()) throw new PromptEnhancementError("not_configured", "");
  const modelType = await resolveModelType(input.workflowType, input.modelKey);
  const family = familyOfModelType(modelType);
  const mode: EnhancerMode = input.workflowType !== "video-create" ? "plain" : usesRef2vaPromptFormat(family) ? "reference" : family === "minimax" ? "layered" : "plain";
  const images = await resolveEnhancerImages(input);

  const result = await completeJson({
    system: buildSystemPrompt(input, family, mode, images),
    user: buildUserPrompt(input),
    schema: mode === "reference" ? referenceShape : mode === "layered" ? layeredShape : simpleShape,
    schemaName: `${input.workflowType}-prompt`,
    jsonSchema: mode === "reference" ? referenceJsonSchema : mode === "layered" ? layeredJsonSchema : simpleJsonSchema,
    images,
  });
  if (!result.ok) throw new PromptEnhancementError(result.reason, result.detail);

  const written = result.value;
  // A model handed the format sometimes copies it back; the envelope is applied
  // here from known facts, so anything it wrote is reduced to prose first.
  const body = isH3Prompt(written.prompt) ? stripH3Envelope(written.prompt) : written.prompt;
  const layers = mode === "plain" ? undefined : (written as z.infer<typeof referenceShape>);
  const assembled = mode === "reference"
    ? renderReferenceWithinLimit({ ...ref2vaDeclarations(input, layers), body: clampPrompt(body, REFERENCE_TIMELINE_BUDGET_CHARS), summary: layers?.summary, soundscape: layers?.soundscape, score: layers?.score })
    : usesH3PromptFormat(family)
      ? renderH3Prompt({ body: clampPrompt(body, TIMELINE_BUDGET_CHARS), soundscape: layers?.soundscape, score: layers?.score, durationSeconds: input.durationSeconds, hasStart: input.hasStartFrame, hasEnd: input.hasEndFrame })
      : appendAudioProse(body, layers?.soundscape, layers?.score);

  const prompt = clampPrompt(assembled);
  logger.info({ event: "prompt_enhancer.completed", workflowType: input.workflowType, modelType, family, model: result.model, images: images.length, chars: prompt.length }, "Prompt enhanced");
  return { prompt, family, model: result.model };
}

/**
 * Every attached picture gets declared, whether or not the rewrite did it.
 *
 * A small local model handed six sections routinely returns four, and Ref2VA
 * reads subject_definitions and retention_analysis before anything else.
 */
function ref2vaDeclarations(input: EnhancePromptRequest, layers: { subjects?: string; retention?: string } | undefined) {
  const fallback = ref2vaFallbackDeclarations({ hasStart: input.hasStartFrame, hasEnd: input.hasEndFrame, referenceCount: input.referenceCount, durationSeconds: input.durationSeconds });
  return { subjects: layers?.subjects?.trim() || fallback.subjects, retention: layers?.retention?.trim() || fallback.retention };
}

/**
 * Trim the timeline rather than the tail when six sections overrun the limit.
 *
 * A flat clamp would cut `non_diegetic_music` off the end, leaving Ref2VA an
 * envelope missing the section it reads last.
 */
function renderReferenceWithinLimit(parts: Parameters<typeof renderRef2vaPrompt>[0]) {
  const rendered = renderRef2vaPrompt(parts);
  if (rendered.length <= MAX_ENHANCED_PROMPT_CHARS) return rendered;
  const budget = Math.max(200, parts.body.length - (rendered.length - MAX_ENHANCED_PROMPT_CHARS));
  return renderRef2vaPrompt({ ...parts, body: clampPrompt(parts.body, budget) });
}
