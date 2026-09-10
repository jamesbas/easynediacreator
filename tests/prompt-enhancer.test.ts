import { describe, expect, it } from "vitest";
import { clampPrompt } from "@/lib/prompt-enhancer/enhance";
import { familyOfModelType, hasNativeAudio, supportsNegativePrompt } from "@/lib/prompt-enhancer/family";
import { h3Mode, isH3Prompt, markDialogue, ref2vaFallbackDeclarations, ref2vaPictureRoles, renderH3Prompt, renderRef2vaPrompt, stripH3Envelope, usesH3PromptFormat, usesRef2vaPromptFormat } from "@/lib/prompt-enhancer/h3-prompt";
import { extractJson } from "@/lib/prompt-enhancer/lm-studio";
import { imagePromptDirective, videoPromptDirective } from "@/lib/prompt-enhancer/directives";

describe("which family a checkpoint is written for", () => {
  it("separates H3's two variants, which share a lineage and almost nothing else", () => {
    expect(familyOfModelType("minimax_h3_fl2va_pruned_pdd")).toBe("minimax");
    expect(familyOfModelType("minimax_h3_ref2va_pruned_pdd")).toBe("minimax_ref2va");
  });

  it("reads the other families off the model type", () => {
    expect(familyOfModelType("ltx2_22B_distilled_1_1")).toBe("ltx");
    expect(familyOfModelType("qwen_image_edit_plus2_20B")).toBe("qwen");
    expect(familyOfModelType("flux2_klein_9b")).toBe("flux");
    expect(familyOfModelType("krea2_turbo_edit")).toBe("krea");
    expect(familyOfModelType("i2v_2_2")).toBe("wan");
    expect(familyOfModelType(undefined)).toBe("unknown");
  });

  it("knows which families discard a negative prompt and which write their own audio", () => {
    expect(supportsNegativePrompt("minimax")).toBe(false);
    expect(supportsNegativePrompt("flux")).toBe(false);
    expect(supportsNegativePrompt("qwen")).toBe(true);
    expect(hasNativeAudio("ltx")).toBe(true);
    expect(hasNativeAudio("wan")).toBe(false);
  });
});

describe("MiniMax H3's prompt envelope", () => {
  const parts = { body: "A keeper crosses the gantry as the lamp turns behind him.", soundscape: "Wind pushes against the glass.", score: "Low sustained strings at a slow tempo.", durationSeconds: 15, hasStart: true, hasEnd: true };

  it("reads the mode off the supplied keyframes", () => {
    expect(h3Mode(true, true)).toBe("fl2va");
    expect(h3Mode(true, false)).toBe("i2va");
    expect(h3Mode(false, true)).toBe("l2va");
    expect(h3Mode(false, false)).toBe("t2va");
  });

  it("opens with the alignment line and carries all three labelled fields", () => {
    const lines = renderH3Prompt(parts).split("\n");
    expect(lines[0]).toContain("How the reference pictures align with the target video");
    expect(lines[0]).toContain("15.00-second mark");
    expect(lines[1]).toBe("integrated_multimodal_description: [Shot 1] A keeper crosses the gantry as the lamp turns behind him.");
    expect(lines[2]).toBe("overall_soundscape: Wind pushes against the glass.");
    expect(lines[3]).toBe("non_diegetic_music: Low sustained strings at a slow tempo.");
  });

  it("writes the guide's N/A for a layer the rewrite left empty, and no header without frames", () => {
    const prompt = renderH3Prompt({ ...parts, hasStart: false, hasEnd: false, soundscape: undefined, score: "" });
    expect(prompt.split("\n")[0]).toContain("integrated_multimodal_description:");
    expect(prompt).toContain("overall_soundscape: N/A");
    expect(prompt).toContain("non_diegetic_music: N/A");
  });

  it("tags spoken lines so H3 performs them instead of describing them", () => {
    expect(markDialogue('Mara says, "We should go."')).toBe('Mara (S1) says: <d>[English] We should go.</d>');
    // Delivery belongs beside the verb: only what sits inside the tag is uttered.
    expect(markDialogue('He says in a low voice, "Not yet."')).toContain("says in a low voice: <d>[English] Not yet.</d>");
    expect(markDialogue("<d>[English] Already tagged.</d>")).toBe("<d>[English] Already tagged.</d>");
  });

  it("recovers plain prose so re-enhancing rewrites the shot rather than the format", () => {
    const plain = stripH3Envelope(renderH3Prompt(parts));
    expect(isH3Prompt(plain)).toBe(false);
    expect(plain).toContain("A keeper crosses the gantry");
    // The audio layers are still direction, so they survive the round trip.
    expect(plain).toContain("Wind pushes against the glass.");
    expect(stripH3Envelope("A plain prose prompt.")).toBe("A plain prose prompt.");
  });

  it("belongs to FL2VA alone — reference mode has its own format", () => {
    expect(usesH3PromptFormat("minimax")).toBe(true);
    for (const family of ["minimax_ref2va", "ltx", "wan", "flux", "qwen", "krea", "unknown"] as const) {
      expect(usesH3PromptFormat(family)).toBe(false);
    }
  });
});

describe("MiniMax H3 Ref2VA's reference envelope", () => {
  const parts = {
    subjects: "<Subject 1> is the violinist from <Picture 1>, preserving her identity and burgundy dress.",
    summary: "[reference generation] Place <Subject 1> on a misty rooftop at dawn.",
    retention: "<Subject 1> (appears in [Shot 1]): fully_preserved - face, hair, and dress are retained.",
    body: "The target video is a single rooftop take. <Subject 1> raises the violin and begins to play.",
    soundscape: "Rooftop wind and close violin performance.",
    score: "N/A",
  };

  it("belongs to Ref2VA alone", () => {
    expect(usesRef2vaPromptFormat("minimax_ref2va")).toBe(true);
    for (const family of ["minimax", "ltx", "wan", "unknown"] as const) expect(usesRef2vaPromptFormat(family)).toBe(false);
  });

  it("writes the six sections in the guide's order", () => {
    const lines = renderRef2vaPrompt(parts).split("\n");
    expect(lines[0]).toBe("subject_definitions:");
    expect(lines[2]).toBe("summary:");
    expect(lines[4]).toBe("retention_analysis:");
    expect(lines[6]).toBe("detailed_description:");
    expect(lines[7]).toContain("[Shot 1] The target video is a single rooftop take.");
    expect(lines[8]).toBe("overall_soundscape: Rooftop wind and close violin performance.");
    expect(lines[9]).toBe("non_diegetic_music: N/A");
  });

  it("declares nothing when nothing was attached, as WanGP's own stock prompt does", () => {
    const prompt = renderRef2vaPrompt({ ...parts, subjects: "", retention: undefined });
    expect(prompt).not.toContain("subject_definitions:");
    expect(prompt).not.toContain("retention_analysis:");
    expect(prompt.startsWith("summary:")).toBe(true);
  });

  it("numbers start and end images ahead of the general references, as WanGP feeds them", () => {
    const roles = ref2vaPictureRoles({ hasStart: true, hasEnd: false, referenceCount: 2, durationSeconds: 15 });
    expect(roles[0]).toContain("<Picture 1> is the start image");
    expect(roles[1]).toContain("<Picture 2> is a general reference image");
    expect(roles[2]).toContain("<Picture 3> is a general reference image");
    const ended = ref2vaPictureRoles({ hasStart: true, hasEnd: true, referenceCount: 1, durationSeconds: 8 });
    expect(ended[1]).toContain("<Picture 2> is the end image");
    expect(ended[1]).toContain("8.00-second mark");
    expect(ended[2]).toContain("<Picture 3> is a general reference image");
  });

  it("recovers prose from the reference envelope too, so re-enhancing rewrites the shot", () => {
    const plain = stripH3Envelope(renderRef2vaPrompt(parts));
    expect(isH3Prompt(plain)).toBe(false);
    expect(plain).toContain("The target video is a single rooftop take.");
    expect(plain).toContain("Rooftop wind");
    // The bookkeeping is rebuilt from the images actually attached, not carried over.
    expect(plain).not.toContain("fully_preserved");
  });

  it("opens the summary with the task types the guide requires", () => {
    expect(renderRef2vaPrompt({ ...parts, summary: "Place her on a rooftop." })).toContain("summary:\n[reference generation] Place her on a rooftop.");
  });

  it("declares every attached picture even when the rewrite left the sections empty", () => {
    const declarations = ref2vaFallbackDeclarations({ hasStart: true, hasEnd: false, referenceCount: 2, durationSeconds: 10 });
    expect(declarations.subjects.split("\n")).toHaveLength(3);
    expect(declarations.subjects).toContain("<Picture 1> is the start image");
    expect(declarations.subjects).toContain("<Subject 1> is the person or object shown in <Picture 2>");
    expect(declarations.subjects).toContain("<Subject 2> is the person or object shown in <Picture 3>");
    expect(declarations.retention).toContain("<Subject 2> (appears in [Shot 1]): fully_preserved");
    expect(ref2vaFallbackDeclarations({ hasStart: false, hasEnd: false, referenceCount: 0, durationSeconds: 10 })).toEqual({ subjects: "", retention: "" });
  });
});

describe("the guidance each family is given", () => {
  it("carries MiniMax's own camera vocabulary and the length its guide asks for", () => {
    const directive = videoPromptDirective("minimax", 15);
    for (const term of ["push in", "truck left", "arc shot", "static shot"]) expect(directive).toContain(term);
    expect(directive).toMatch(/350 to 500 words/);
    expect(directive).toMatch(/no negative prompt/i);
  });

  it("tells reference mode which section every attached picture belongs in", () => {
    const directive = videoPromptDirective("minimax_ref2va", 15, { hasStartFrame: true, referenceCount: 1 });
    expect(directive).toContain("subject_definitions");
    expect(directive).toContain("retention_analysis");
    expect(directive).toContain("detailed_description");
    expect(directive).toContain("<Picture 1> is the start image");
    expect(directive).toContain("<Picture 2> is a general reference image");
    // With nothing attached it must not invent assets to declare.
    expect(videoPromptDirective("minimax_ref2va", 15)).toContain("No reference asset is attached");
    expect(videoPromptDirective("minimax", 15)).not.toContain("subject_definitions");
  });

  it("says nothing at all for a checkpoint it does not recognise", () => {
    expect(videoPromptDirective("unknown", 15)).toBe("");
    expect(imagePromptDirective("unknown")).toBe("");
    expect(imagePromptDirective("flux")).toMatch(/no negative prompt/i);
  });
});

describe("reading an answer out of a local model", () => {
  it("unwraps reasoning blocks and code fences before parsing", () => {
    expect(extractJson('<think>weighing it up</think>{"prompt":"a lighthouse"}')).toEqual({ prompt: "a lighthouse" });
    expect(extractJson('```json\n{"prompt":"a lighthouse"}\n```')).toEqual({ prompt: "a lighthouse" });
    expect(extractJson('Here you go: {"prompt":"a lighthouse"} — enjoy')).toEqual({ prompt: "a lighthouse" });
  });

  it("reports nothing rather than throwing when the answer is not JSON", () => {
    expect(extractJson("I would rather describe it in words.")).toBeUndefined();
  });
});

describe("keeping a rewrite inside the prompt limit", () => {
  it("cuts at a sentence boundary rather than mid-clause", () => {
    const text = `${"A ".repeat(40)}sentence one. ${"B ".repeat(40)}sentence two.`;
    const clamped = clampPrompt(text, 120);
    expect(clamped.length).toBeLessThanOrEqual(120);
    expect(clamped.endsWith(".")).toBe(true);
  });

  it("leaves a prompt that already fits exactly as written", () => {
    expect(clampPrompt("  A short prompt.  ", 100)).toBe("A short prompt.");
  });
});
