import { describe, expect, it } from "vitest";
import { clampPrompt } from "@/lib/prompt-enhancer/enhance";
import { familyOfModelType, hasNativeAudio, supportsNegativePrompt } from "@/lib/prompt-enhancer/family";
import { h3Mode, isH3Prompt, markDialogue, renderH3Prompt, stripH3Envelope, usesH3PromptFormat } from "@/lib/prompt-enhancer/h3-prompt";
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

describe("the guidance each family is given", () => {
  it("carries MiniMax's own camera vocabulary and the length its guide asks for", () => {
    const directive = videoPromptDirective("minimax", 15);
    for (const term of ["push in", "truck left", "arc shot", "static shot"]) expect(directive).toContain(term);
    expect(directive).toMatch(/350 to 500 words/);
    expect(directive).toMatch(/no negative prompt/i);
  });

  it("tells reference mode that its pictures mean nothing without the prose", () => {
    expect(videoPromptDirective("minimax_ref2va", 15)).toContain("<Picture 1>");
    expect(videoPromptDirective("minimax", 15)).not.toContain("<Picture 1>");
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
