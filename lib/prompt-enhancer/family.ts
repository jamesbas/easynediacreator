/**
 * Which lineage a checkpoint belongs to, for prompt-writing purposes only.
 *
 * The families disagree about what a good prompt is — FLUX has no negative
 * prompt and wants exclusions written as the thing to render instead, Qwen is
 * literal about structure, Wan asks for motion and camera and little else, LTX
 * wants one flowing present-tense paragraph and writes its own soundtrack from
 * it, and MiniMax H3 takes a labelled envelope rather than prose. Sending one
 * undifferentiated instruction to all of them means writing for none of them.
 *
 * H3 is split because its two variants share a lineage and almost nothing else:
 * FL2VA pins a start and end frame positionally, Ref2VA takes every image as an
 * undifferentiated reference and learns what each one means from the prose.
 */
export const PROMPT_FAMILIES = ["qwen", "flux", "krea", "ltx", "wan", "minimax", "minimax_ref2va", "unknown"] as const;
export type PromptFamily = (typeof PROMPT_FAMILIES)[number];

/** Wan2GP names most of its Wan checkpoints after the task rather than the lineage. */
const WAN_PREFIXES = /^(wan|i2v|t2v|vace|flf2v|fun_inp|animate|multitalk|infinitetalk|phantom|lucy_edit|alpha|bernini|moviigen|recam|sky_df|lynx|mocha|shotplan|scail|ovi)/;

export function familyOfModelType(modelType: string | undefined): PromptFamily {
  const value = (modelType ?? "").toLowerCase();
  if (!value) return "unknown";
  if (value.includes("minimax")) return value.includes("ref2va") ? "minimax_ref2va" : "minimax";
  if (value.startsWith("ltx")) return "ltx";
  if (value.includes("krea")) return "krea";
  if (value.includes("qwen")) return "qwen";
  if (value.includes("flux")) return "flux";
  if (WAN_PREFIXES.test(value)) return "wan";
  return "unknown";
}

/** Whether this video family writes its own soundtrack from the same prompt. */
export function hasNativeAudio(family: PromptFamily) {
  return family === "ltx" || family === "minimax" || family === "minimax_ref2va";
}

/**
 * Families that discard a negative prompt.
 *
 * A live `minimax_h3_fl2va` schema declares no `negative_prompt` field at all,
 * and Black Forest Labs state plainly that FLUX has no conventional negative
 * prompting, so exclusions have to travel inside the positive prompt.
 */
export function supportsNegativePrompt(family: PromptFamily) {
  return family !== "flux" && family !== "krea" && family !== "minimax" && family !== "minimax_ref2va";
}
