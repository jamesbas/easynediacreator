import { describe, expect, it } from "vitest";
import { getGenerationControls, validateGenerationControls } from "@/lib/wan-gp/generation-controls";

describe("WanGP generation controls", () => {
  const schema = {
    model_def: {
      resolutions: [["Landscape", "1280x720"], ["Portrait", "720x1280"]],
      sample_solvers: [["Distilled 8 Steps", "distilled_8_steps"], ["Euler", "euler"]],
      duration_slider: { min: 2, max: 12, increment: 2, default: 6 },
    },
    properties: {
      num_inference_steps: { minimum: 4, maximum: 40, step: 2 },
      guidance_scale: { min: 1, max: 9, inc: 0.5 },
      force_fps: { min: 12, max: 30, step: 6 },
      scheduler_type: { choices: [{ label: "Normal", value: "normal" }, { label: "Karras", value: "karras" }] },
    },
  };

  it("normalizes model choices and numeric constraints", () => {
    expect(getGenerationControls(schema, { resolution: "1280x720", num_inference_steps: 8, guidance_scale: 3, force_fps: 24, scheduler_type: "normal" }, { workflow: "video", fallbackResolutions: [], fallbackResolution: "1280x720" })).toMatchObject({
      resolutions: [{ label: "Landscape", value: "1280x720" }, { label: "Portrait", value: "720x1280" }],
      steps: { min: 4, max: 40, step: 2, defaultValue: 8 },
      guidance: { min: 1, max: 9, step: 0.5, defaultValue: 3 },
      solvers: [{ label: "Distilled 8 Steps", value: "distilled_8_steps" }, { label: "Euler", value: "euler" }],
      schedulerKey: "scheduler_type",
      duration: { min: 2, max: 12, step: 2, defaultValue: 6 },
      fps: { min: 12, max: 30, step: 6, defaultValue: 24 },
    });
  });

  it("falls back conservatively when older schemas omit control metadata", () => {
    expect(getGenerationControls({}, { resolution: "1024x1024", guidance_scale: 4 }, { workflow: "image", fallbackResolutions: ["1024x1024"], fallbackResolution: "1024x1024" })).toMatchObject({
      resolutions: [{ label: "1024x1024", value: "1024x1024" }],
      steps: { min: 1, max: 200, step: 1, defaultValue: 20 },
      guidance: { min: 0, max: 30, step: 0.1, defaultValue: 4 },
      solvers: [],
      schedulers: [],
    });
  });

  it("rejects values outside the selected model contract", () => {
    const controls = getGenerationControls(schema, { scheduler_type: "normal" }, { workflow: "video", fallbackResolutions: [], fallbackResolution: "1280x720" });
    expect(() => validateGenerationControls({ resolution: "640x480" }, controls)).toThrow(/Resolution/);
    expect(() => validateGenerationControls({ steps: 5 }, controls)).toThrow(/increments of 2/);
    expect(() => validateGenerationControls({ sampleSolver: "unknown" }, controls)).toThrow(/Solver/);
    expect(() => validateGenerationControls({ scheduler: "unknown" }, controls)).toThrow(/Scheduler/);
    expect(() => validateGenerationControls({ durationSeconds: 14 }, controls)).toThrow(/Duration/);
  });
});