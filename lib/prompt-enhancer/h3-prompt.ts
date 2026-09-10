import type { PromptFamily } from "./family";

/**
 * MiniMax H3's native prompt envelopes.
 *
 * H3 does not take one blob of prose, and its two variants do not take the same
 * envelope. FL2VA's guide (VIDEO_PROMPT_WRITING_GUIDE_base_en) specifies an
 * optional alignment instruction followed by three labelled fields: the
 * timeline, the ambience, and the audience-only score. Ref2VA's guide
 * (VIDEO_PROMPT_WRITING_GUIDE_ref_en) specifies six sections, because it must
 * declare what every supplied asset is before it can say what the video does
 * with it. WanGP passes `prompt` through untouched, so nothing between this app
 * and the model produces either shape if we do not.
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

/** Tidies a list-shaped field without collapsing the one-entry-per-line layout. */
function tidyLines(value: string | undefined) {
  return (value ?? "").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
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

/**
 * Ref2VA's own envelope, which is a different and larger thing.
 *
 * Its guide (VIDEO_PROMPT_WRITING_GUIDE_ref_en) specifies six labelled
 * sections in a fixed order, because a reference prompt has to say what each
 * supplied asset is before it can say what the video does with it. WanGP's
 * own Ref2VA writing rules require exactly these sections in this order, and
 * omit the ones with nothing to declare — its stock Ref2VA prompt ships with
 * `summary`, `detailed_description` and `overall_soundscape` alone.
 */
export type Ref2vaPromptParts = {
  /** One `<Subject N>` or `<Picture N>` definition per line. */
  subjects?: string;
  /** Opens with the bracketed task types, e.g. `[reference generation]`. */
  summary?: string;
  /** One retention line per declared label. */
  retention?: string;
  /** The `detailed_description` timeline, without the `[Shot 1]` marker. */
  body: string;
  soundscape?: string;
  score?: string;
};

export function renderRef2vaPrompt(parts: Ref2vaPromptParts) {
  const subjects = tidyLines(parts.subjects);
  const retention = tidyLines(parts.retention);
  const written = tidyLines(parts.summary);
  // The guide opens the summary with its bracketed task types; a rewrite that
  // forgets them is missing the first thing Ref2VA reads.
  const summary = written && !written.startsWith("[") ? `[reference generation] ${written}` : written;
  const timeline = `${SHOT} ${markDialogue(tidyLines(parts.body)).replace(/^\[Shot 1\]\s*/, "")}`;
  return [
    subjects && `subject_definitions:\n${subjects}`,
    summary && `summary:\n${summary}`,
    retention && `retention_analysis:\n${retention}`,
    `detailed_description:\n${timeline}`,
    `overall_soundscape: ${tidy(parts.soundscape) || "N/A"}`,
    `non_diegetic_music: ${tidy(parts.score) || "N/A"}`,
  ].filter(Boolean).join("\n");
}

type Ref2vaPictures = { hasStart: boolean; hasEnd: boolean; referenceCount: number; durationSeconds: number };

/**
 * How Ref2VA numbers the images it is handed.
 *
 * WanGP shows the start and end images to the prompt before the general
 * reference images: with a start image and one reference image, the start
 * image is `<Picture 1>` and the reference image is `<Picture 2>`. A keyframe
 * earns its own entry; a plain reference does not, and is declared as a
 * `<Subject N>` taken from its picture instead.
 */
export function ref2vaPictureRoles({ hasStart, hasEnd, referenceCount, durationSeconds }: Ref2vaPictures) {
  const roles: string[] = [];
  if (hasStart) roles.push(`<Picture ${roles.length + 1}> is the start image, a concrete keyframe that is the first frame of [Shot 1] at 0.00 seconds; give it its own entry in subject_definitions and retention_analysis.`);
  if (hasEnd) roles.push(`<Picture ${roles.length + 1}> is the end image, a concrete keyframe aligned with the ${seconds(durationSeconds)}-second mark; give it its own entry in subject_definitions and retention_analysis.`);
  for (let index = 0; index < referenceCount; index += 1) {
    roles.push(`<Picture ${roles.length + 1}> is a general reference image and not a keyframe: declare what it contributes as a <Subject N> taken from it, and never align it to a time.`);
  }
  return roles;
}

/**
 * The declarations the attached images require, written from what is known.
 *
 * A local model handed six sections will sometimes return four, and an envelope
 * that names `<Subject 1>` in its timeline without ever defining it is worse
 * than one that never mentions it. These lines are deliberately plain: they say
 * only what the attachment itself proves, so they can stand in unedited when
 * the rewrite leaves a section empty.
 */
export function ref2vaFallbackDeclarations({ hasStart, hasEnd, referenceCount, durationSeconds }: Ref2vaPictures) {
  const subjects: string[] = [];
  const retention: string[] = [];
  let picture = 0;
  if (hasStart) {
    picture += 1;
    subjects.push(`<Picture ${picture}> is the start image, the first frame of [Shot 1] at 0.00 seconds.`);
    retention.push(`<Picture ${picture}> (appears in [Shot 1]): fully_preserved - the composition, subjects, wardrobe and lighting it shows open the clip unchanged.`);
  }
  if (hasEnd) {
    picture += 1;
    subjects.push(`<Picture ${picture}> is the end image, the frame the clip reaches at the ${seconds(durationSeconds)}-second mark.`);
    retention.push(`<Picture ${picture}> (appears in [Shot 1]): fully_preserved - the composition, subjects, wardrobe and lighting it shows close the clip unchanged.`);
  }
  for (let subject = 1; subject <= referenceCount; subject += 1) {
    picture += 1;
    subjects.push(`<Subject ${subject}> is the person or object shown in <Picture ${picture}>, preserving its identity, face, hair, clothing and distinctive objects exactly as photographed.`);
    retention.push(`<Subject ${subject}> (appears in [Shot 1]): fully_preserved - appearance and identity are carried over from <Picture ${picture}>; the setting, action and camera are new.`);
  }
  return { subjects: subjects.join("\n"), retention: retention.join("\n") };
}

const H3_LABELS = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "integrated_multimodal_description", "overall_soundscape", "non_diegetic_music"] as const;
const H3_LABEL_PATTERN = new RegExp(`(?:^|\\s)(${H3_LABELS.join("|")}):`, "g");

/** Whether a prompt has already been put in either envelope. */
export function isH3Prompt(prompt: string) {
  return prompt.includes("integrated_multimodal_description:") || prompt.includes("detailed_description:");
}

function h3Sections(prompt: string) {
  const sections = new Map<string, string>();
  const labels = [...prompt.matchAll(H3_LABEL_PATTERN)];
  labels.forEach((label, index) => {
    const start = (label.index ?? 0) + label[0].length;
    sections.set(label[1], prompt.slice(start, labels[index + 1]?.index ?? prompt.length));
  });
  return sections;
}

/**
 * Recover the plain timeline prose from either envelope.
 *
 * Re-enhancing an enveloped prompt has to hand the model prose, not labels, or
 * the rewrite is a rewrite of the format. The two audio layers are still
 * direction, so they are folded back into the prose rather than dropped; the
 * reference bookkeeping is not, because it is rebuilt from the images actually
 * attached. Reads either layout, so a prompt flattened on its way to Wan2GP and
 * pasted back still strips cleanly.
 */
export function stripH3Envelope(prompt: string) {
  if (!isH3Prompt(prompt)) return stripDialogueMarkup(prompt);
  const sections = h3Sections(prompt);
  const timeline = sections.get("detailed_description") ?? sections.get("integrated_multimodal_description") ?? "";
  const audio = [sections.get("overall_soundscape"), sections.get("non_diegetic_music")].map(tidy).filter((value) => value && value !== "N/A");
  return [tidy(timeline).replace(/^\[Shot 1\]\s*/, ""), ...audio].map(stripDialogueMarkup).join(" ").trim();
}

/** FL2VA and its one-ended relatives take the three-field envelope. */
export function usesH3PromptFormat(family: PromptFamily) {
  return family === "minimax";
}

/** Ref2VA takes the six-section reference envelope instead. */
export function usesRef2vaPromptFormat(family: PromptFamily) {
  return family === "minimax_ref2va";
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
