import type { PromptFamily } from "./family";

/**
 * MiniMax H3's native prompt envelope.
 *
 * H3 does not take one blob of prose. Its published guide
 * (VIDEO_PROMPT_WRITING_GUIDE_base_en) specifies an optional alignment
 * instruction followed by three labelled fields: the timeline, the ambience,
 * and the audience-only score. WanGP passes `prompt` through untouched, so
 * nothing between this app and the model produces that shape if we do not.
 *
 * Fields are written on their own lines because that is how they read in the
 * prompt box. `normalizeWanGpPrompt` folds them onto one line on the way to
 * Wan2GP, which splits a prompt into separate generation tasks at every line
 * break under `multi_prompts_gen_type: "PG"`. The labels survive either way.
 */

/** Which of H3's modes a set of supplied keyframes puts the job in. */
export type H3Mode = "t2va" | "i2va" | "l2va" | "fl2va";

export function h3Mode(hasStart: boolean, hasEnd: boolean): H3Mode {
  if (hasStart && hasEnd) return "fl2va";
  if (hasStart) return "i2va";
  if (hasEnd) return "l2va";
  return "t2va";
}

/** The guide formats every timestamp to exactly two decimal places. */
function seconds(value: number) {
  return Math.max(0, value).toFixed(2);
}

function tidy(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The first line, which tells H3 where each supplied frame lands in time.
 *
 * The wording is quoted from the guide rather than chosen — each mode has one
 * sentence. Text-to-video has no instruction at all.
 */
export function h3AlignmentHeader(mode: H3Mode, durationSeconds: number) {
  if (mode === "i2va") return "For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.";
  if (mode === "l2va") return `How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the ${seconds(durationSeconds)}-second mark of the target video.`;
  if (mode === "fl2va") return `How the reference pictures align with the target video — <Picture 1> (from [Shot 1]) aligns with the 0.00-second mark of the target video; <Picture 2> (from [Shot 1]) aligns with the ${seconds(durationSeconds)}-second mark of the target video.`;
  return "";
}

const SHOT = "[Shot 1]";

/** Speech markup: `<d>[Language] words</d>`, per the guide. */
const DIALOGUE_TAG = /<d>\s*\[[^\]]*\]\s*([\s\S]*?)<\/d>/g;

/**
 * A said/says clause with the spoken words quoted after it.
 *
 * The delivery usually sits between the two — `says in a low voice, "…"` — so a
 * clause of up to a line is allowed there, provided it ends in the comma or
 * colon that introduces the quote.
 */
const SPOKEN_CLAUSE = /(?:\b(\p{Lu}[\p{L}'’-]*)\s+)?\b(says?|said)\b([^"“”\n]{0,80}?)[,:]?\s*["“]([^"”]+)["”]/gu;

/**
 * Tag spoken lines so H3 performs them instead of describing them.
 *
 * Inside the envelope a quoted sentence is just more description. The guide is
 * explicit that only `<d>` content is uttered, and that the speaker id and the
 * delivery stay outside the tag. A prompt that already carries markup is left
 * alone, so nothing written to the contract is rewritten by a regex.
 */
export function markDialogue(text: string) {
  DIALOGUE_TAG.lastIndex = 0;
  if (DIALOGUE_TAG.test(text)) return text;
  const ids = new Map<string, number>();
  let speakers = 0;
  return text.replace(SPOKEN_CLAUSE, (_match, name: string | undefined, verb: string, delivery: string, line: string) => {
    // One id per speaker for the whole prompt: a character who talks twice was
    // being numbered twice, which reads as two people and can be voiced as two.
    const key = name?.toLocaleLowerCase();
    let id = key ? ids.get(key) : undefined;
    if (id === undefined) { speakers += 1; id = speakers; if (key) ids.set(key, id); }
    const said = `${verb}${delivery.replace(/[\s,:]+$/, "")}`;
    return `${name ? `${name} ` : ""}(S${id}) ${said}: <d>[English] ${line.trim()}</d>`;
  });
}

/** Put tagged speech back to ordinary quoted prose for everything else. */
export function stripDialogueMarkup(text: string) {
  return text.replace(DIALOGUE_TAG, (_match, line: string) => `"${line.trim()}"`);
}

export type H3PromptParts = {
  /** The timeline prose, without the `[Shot 1]` marker. */
  body: string;
  /** Ambience and physical sound. Empty falls back to the guide's `N/A`. */
  soundscape?: string;
  /** Audience-only score. Empty means there is none, which the guide writes `N/A`. */
  score?: string;
  durationSeconds: number;
  hasStart: boolean;
  hasEnd: boolean;
};

/**
 * Assemble the envelope.
 *
 * One shot only: the guide says FL2VA "generally favors a single shot so the
 * model can interpolate continuously from the first frame to the last frame".
 */
export function renderH3Prompt(parts: H3PromptParts) {
  const header = h3AlignmentHeader(h3Mode(parts.hasStart, parts.hasEnd), parts.durationSeconds);
  const timeline = `${SHOT} ${markDialogue(tidy(parts.body)).replace(/^\[Shot 1\]\s*/, "")}`;
  const fields = [
    `integrated_multimodal_description: ${timeline}`,
    `overall_soundscape: ${tidy(parts.soundscape) || "N/A"}`,
    `non_diegetic_music: ${tidy(parts.score) || "N/A"}`,
  ];
  return [header, ...fields].filter(Boolean).join("\n");
}

/** Whether a prompt has already been put in the envelope. */
export function isH3Prompt(prompt: string) {
  return prompt.includes("integrated_multimodal_description:");
}

/**
 * Recover the plain timeline prose from an envelope.
 *
 * Re-enhancing an enveloped prompt has to hand the model prose, not labels, or
 * the rewrite is a rewrite of the format. The two audio layers are still
 * direction, so they are folded back into the prose rather than dropped.
 * Reads either layout, so a prompt flattened on its way to Wan2GP and pasted
 * back still strips cleanly.
 */
export function stripH3Envelope(prompt: string) {
  if (!isH3Prompt(prompt)) return stripDialogueMarkup(prompt);
  const after = prompt.slice(prompt.indexOf("integrated_multimodal_description:"));
  const timeline = after.replace(/^integrated_multimodal_description:\s*/, "").split(/\s*(?:overall_soundscape|non_diegetic_music):/)[0] ?? "";
  const sound = /overall_soundscape:\s*([\s\S]*?)(?=\s*non_diegetic_music:|$)/.exec(prompt);
  const music = /non_diegetic_music:\s*([\s\S]*)$/.exec(prompt);
  const audio = [sound?.[1], music?.[1]].map(tidy).filter((value) => value && value !== "N/A");
  return [tidy(timeline).replace(/^\[Shot 1\]\s*/, ""), ...audio].map(stripDialogueMarkup).join(" ").trim();
}

/**
 * Only FL2VA and its one-ended relatives take this envelope.
 *
 * Ref2VA's own format is a different, larger thing — it has to say what every
 * undifferentiated `<Picture N>` means — so it is given the reference-mode
 * writing directive and plain prose rather than a format it half-fits.
 */
export function usesH3PromptFormat(family: PromptFamily) {
  return family === "minimax";
}

/**
 * Fold the audio layers into prose for a family that has nowhere to put them.
 *
 * H3's directive keeps ambience and score out of the timeline. Without the
 * envelope those fields reach nothing, and a model that writes its own
 * soundtrack given no audio direction does not stay silent — it invents one.
 */
export function appendAudioProse(prompt: string, soundscape?: string, score?: string) {
  const layers = [tidy(soundscape), tidy(score)].filter((layer) => layer && layer !== "N/A");
  return layers.length ? `${prompt.trim()} ${layers.join(" ")}`.trim() : prompt.trim();
}
