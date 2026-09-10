import { hasNativeAudio, supportsNegativePrompt, type PromptFamily } from "./family";
import { ref2vaPictureRoles } from "./h3-prompt";

/**
 * Per-family prompt rules, taken from each developer's own published guidance.
 *
 * The families disagree on points that matter. FLUX wants exclusions stated
 * positively and treats lighting as the highest-leverage instruction; Qwen
 * wants literal copy quoted and layout named; Wan's official image-to-video
 * formula is motion plus camera and nothing else; LTX wants one flowing
 * present-tense shot and writes the soundtrack from the same text; MiniMax H3
 * wants 350-500 words in a controlled camera vocabulary. A directive written
 * for FLUX and rendered by Qwen is worse than no directive at all, so an
 * unrecognised checkpoint gets none.
 */
export function imagePromptDirective(family: PromptFamily) {
  switch (family) {
    case "flux":
      return "This renders on FLUX, which has no negative prompt: anything that must stay out of the frame has to be written into the prompt as the thing to render instead. Write \"crisp subject detail\" rather than \"no blur\", \"a sparse, uncluttered setting\" rather than \"no clutter\". State lighting explicitly and in full — source, direction, quality, contrast and colour temperature — because it moves the render further than any other instruction. Where a colour must be exact, give the name and its hex value.";
    case "qwen":
      return "This renders on Qwen-Image, which is unusually literal about structure and text. Order the prompt as format, then subject, then layout, then lighting and finish. Any lettering that must appear in frame goes in quotation marks exactly as it should read, with its position and relative size stated; if no lettering belongs in the shot, say so. Describe materials at two scales — the macro structure and the micro texture — since that is where this model repays detail.";
    case "krea":
      return "This renders on Krea, which has no dependable negative prompt: state exclusions as the thing to render instead. Separate what is in the frame from how it looks — subject, action and composition first, then a single coherent visual language for palette, texture and finish. Do not stack competing style labels; one visual system described through its visible properties beats five names.";
    default:
      return "";
  }
}

function actionBeats(segmentSeconds: number) {
  const beats = Math.max(1, Math.floor(segmentSeconds / 3));
  return beats === 1 ? "one beat" : `${beats} beats`;
}

export type VideoPromptContext = { hasStartFrame?: boolean; hasEndFrame?: boolean; referenceCount?: number };

/** Shared by both H3 variants: camera vocabulary, length, and the three audio layers. */
function h3CommonRules(durationSeconds: number) {
  return (
    "Write the camera as a single move inside the action, in MiniMax's own terms — push in, pull out, zoom in, zoom out, pan left or right, truck left or right, tilt up or down, pedestal up or down, arc shot, tracking shot, static shot — qualified only where it is not ordinary: \"with small amplitude\" or \"with large amplitude\", \"at slow speed\" or \"at fast speed\". A locked camera holds a static shot, and say so rather than leaving it unsaid. " +
    "This model has no negative prompt, so anything that must stay out of the clip has to be written as the thing to show in its place. " +
    "H3 writes the soundtrack from this same prompt and keeps three layers apart. Ambience and physical sound — weather, traffic, footsteps, fabric, impacts, breathing — are the scene's continuous soundscape and should be tied to things visibly happening. Score that only the audience can hear is described by its instrumentation, tempo and how it builds or fades, never by the mood it is meant to produce, which the model cannot render. Speech is the third: name who speaks and establish them once — age, whether they are on or off screen, pitch and pace — and keep the delivery outside the quotation marks with only the spoken words inside, word for word. Keep speaker ids such as (S1) stable throughout. " +
    `About ${Math.round(durationSeconds * 2)} words of speech fill ${durationSeconds} seconds at a natural pace. ` +
    "Keep the ambience and the score out of the timeline and return them in their own fields; keep the spoken lines in the timeline itself."
  );
}

export function videoPromptDirective(family: PromptFamily, durationSeconds: number, context: VideoPromptContext = {}) {
  const nativeAudio = hasNativeAudio(family);
  switch (family) {
    case "wan":
      return "This clip renders on Wan, whose published image-to-video formula is motion plus camera movement and nothing more. Keep the prompt short and literal: one thing that happens with its direction and speed, at most one smaller movement alongside it, then the camera. Qualify every movement with pace — \"slowly turns\", \"takes one cautious step\" — because an unqualified verb renders as an average of every speed it could mean. If the camera is locked, say \"fixed camera, unchanged framing\" rather than leaving it unsaid.";
    case "ltx":
      return (
        "This clip renders on LTX. Write one flowing paragraph in the present tense, four to eight sentences for a shot with real movement and fewer for a held one. Convey feeling through what the body does — a jaw tightening, a gaze dropping — never through an emotional label, which the model cannot render. State the camera move relative to the subject and say what the framing settles on at the end, so the movement has somewhere to finish. Avoid signs, logos and readable text: this model does not hold them steady. " +
        `Write the action as a chronological sequence rather than one isolated movement — at most ${actionBeats(durationSeconds)}, the first being what the clip is about and any that follow leading on from it. ` +
        "Keep it to one continuous take and do not name a transition of any kind — no \"cut to\", \"a hard cut\", \"match cut\" or \"dissolve\". Prefer motion that is plausible and simply described; highly chaotic movement renders with artifacts." +
        (nativeAudio
          ? " LTX writes the soundtrack from this same prompt. Describe the ambience and any Foley, and put every spoken line in quotation marks with the delivery named. Name the language and the accent whenever a line is not spoken in unaccented English. " +
            `About ${Math.round(durationSeconds * 2)} words of speech fill ${durationSeconds} seconds at a natural pace, so use that budget rather than reducing an exchange to a single remark.`
          : "")
      );
    case "minimax":
      return (
        "This clip renders on MiniMax H3 FL2VA, its first-and-last-frame mode: any supplied keyframes are pinned to the opening and closing moments and the model generates the path between them. Describe that path, not the endpoints — write the opening state, then the visible changes in the order they happen, then how the differences narrow until the closing frame is reached. " +
        "Keep it to one continuous shot with no cuts, which is what FL2VA interpolates best; only a change of place, time or subject that the request genuinely needs justifies a second shot. " +
        "Open by naming the visual style and the framing, then give one thing that happens and at most one smaller movement alongside it, each qualified with its pace. " +
        h3CommonRules(durationSeconds) + " " +
        "Write it long and specific — MiniMax ask for roughly 350 to 500 words, and H3 is built to consume that much. Fill it by describing more closely, never by adding more events: the opening composition and framing, how the subject looks and where it sits in the frame, the setting and its light, each stage the one action passes through and what changes as it does, the camera, and the sound of whatever is visibly happening. Describe what is seen rather than summarising what occurs."
      );
    case "minimax_ref2va":
      return (
        "This clip renders on MiniMax H3 Ref2VA, its full-reference mode. Ref2VA does not take the FL2VA timeline: it takes six sections, and every supplied asset has to be declared before the timeline can use it. " +
        (context.referenceCount || context.hasStartFrame || context.hasEndFrame
          ? `The pictures are numbered in the order Ref2VA receives them. ${ref2vaPictureRoles({ hasStart: Boolean(context.hasStartFrame), hasEnd: Boolean(context.hasEndFrame), referenceCount: context.referenceCount ?? 0, durationSeconds }).join(" ")} Never invent a picture, subject, video or audio asset that is not in that list, and never describe a face or a garment you were not shown — the photograph carries the likeness and a written face competes with it. `
          : "No reference asset is attached, so declare no <Picture>, <Subject>, <Video> or <Audio> labels and write the request as a plain new generation. ") +
        "\"subjects\" holds one definition per line, each naming a <Subject N> and the picture it comes from together with the traits to keep — identity, hair, wardrobe, distinctive objects. " +
        "\"summary\" is one or two sentences that open with the bracketed task types, normally [reference generation], and say what the new video does with the references. " +
        "\"retention\" holds one line per declared label in the form `<Subject 1> (appears in [Shot 1]): fully_preserved - ...`, choosing fully_preserved, partially_preserved, attribute_transfer or weak_reference for anything visible and fully_copy, partially_copy, reference or weak_reference for audio, and saying plainly what is kept and what is new. A newly requested action is not a loss of fidelity. " +
        "\"prompt\" is the detailed_description: open by naming the overall visual treatment, then begin [Shot 1] with no timestamp. State a subject's label, visible traits, position and action at its first appearance and reuse the bare label afterwards. A later hard cut opens `[Shot N] At MM:SS.mmm, ...` at a strictly increasing time inside the clip, and is worth making only when it adds a new subject, place, state, viewpoint or time; keep identity, wardrobe, props, geography, lighting and causality consistent across it. " +
        h3CommonRules(durationSeconds) + " " +
        "MiniMax ask for roughly 350 to 500 words in the detailed_description. Fill it by describing more closely, never by adding events the request did not ask for."
      );
    default:
      return "";
  }
}

/** Told to every family that discards a negative prompt, whatever it renders. */
export function exclusionDirective(family: PromptFamily) {
  return supportsNegativePrompt(family)
    ? ""
    : "This model discards a negative prompt, so anything the user asked to avoid must be rewritten into the prompt as the thing to render in its place.";
}
