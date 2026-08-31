import { z } from "zod";
import { getModels } from "@/lib/runtime/model-cache";
import { logger } from "@/lib/telemetry";
import { exclusionDirective, imagePromptDirective, videoPromptDirective } from "./directives";
import { familyOfModelType, type PromptFamily } from "./family";
import { appendAudioProse, isH3Prompt, renderH3Prompt, stripH3Envelope, usesH3PromptFormat } from "./h3-prompt";
import { completeJson, isPromptEnhancerConfigured, type EnhancerFailure } from "./lm-studio";

export const MAX_ENHANCED_PROMPT_CHARS = 4000;
/** Leaves room for H3's alignment line and three field labels inside the limit. */
const TIMELINE_BUDGET_CHARS = 3200;

export const enhancePromptRequestSchema = z.object({
  workflowType: z.enum(["image-create", "image-edit", "video-create"]),
  modelKey: z.string().min(1).max(200),
  prompt: z.string().trim().min(1, "Write a prompt before enhancing it.").max(MAX_ENHANCED_PROMPT_CHARS),
  durationSeconds: z.number().int().min(1).max(3600).default(15),
  hasStartFrame: z.boolean().default(false),
  hasEndFrame: z.boolean().default(false),
  hasSourceImage: z.boolean().default(false),
  referenceCount: z.number().int().min(0).max(8).default(0),
});
export type EnhancePromptRequest = z.infer<typeof enhancePromptRequestSchema>;

const simpleShape = z.object({ prompt: z.string().trim().min(1) });
const layeredShape = simpleShape.extend({ soundscape: z.string().trim().optional(), score: z.string().trim().optional() });
const simpleJsonSchema = { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"], additionalProperties: false };
const layeredJsonSchema = {
  type: "object",
  properties: { prompt: { type: "string" }, soundscape: { type: "string" }, score: { type: "string" } },
  required: ["prompt", "soundscape", "score"],
  additionalProperties: false,
};

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

function buildSystemPrompt(input: EnhancePromptRequest, family: PromptFamily, layered: boolean) {
  const parts = [
    BASE_SYSTEM,
    workflowDirective(input),
    referenceDirective(input.referenceCount),
    input.workflowType === "video-create" ? videoPromptDirective(family, input.durationSeconds) : imagePromptDirective(family),
    exclusionDirective(family),
    layered
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
  const layered = input.workflowType === "video-create" && (family === "minimax" || family === "minimax_ref2va");

  const result = await completeJson({
    system: buildSystemPrompt(input, family, layered),
    user: buildUserPrompt(input),
    schema: layered ? layeredShape : simpleShape,
    schemaName: `${input.workflowType}-prompt`,
    jsonSchema: layered ? layeredJsonSchema : simpleJsonSchema,
  });
  if (!result.ok) throw new PromptEnhancementError(result.reason, result.detail);

  const written = result.value;
  // A model handed the format sometimes copies it back; the envelope is applied
  // here from known facts, so anything it wrote is reduced to prose first.
  const body = isH3Prompt(written.prompt) ? stripH3Envelope(written.prompt) : written.prompt;
  const layers = layered ? (written as z.infer<typeof layeredShape>) : undefined;
  const assembled = usesH3PromptFormat(family)
    ? renderH3Prompt({ body: clampPrompt(body, TIMELINE_BUDGET_CHARS), soundscape: layers?.soundscape, score: layers?.score, durationSeconds: input.durationSeconds, hasStart: input.hasStartFrame, hasEnd: input.hasEndFrame })
    : appendAudioProse(body, layers?.soundscape, layers?.score);

  const prompt = clampPrompt(assembled);
  logger.info({ event: "prompt_enhancer.completed", workflowType: input.workflowType, modelType, family, model: result.model, chars: prompt.length }, "Prompt enhanced");
  return { prompt, family, model: result.model };
}
