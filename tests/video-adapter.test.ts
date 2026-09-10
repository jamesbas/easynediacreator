import { describe, expect, it } from "vitest";
import { videoCreateRequestSchema } from "@/lib/requests";
import { buildVideoSettings } from "@/lib/wan-gp/adapters/video";

/** The live MiniMax H3 contract: a 107 + 17k frame grid and a 362-frame stored window. */
const H3_DEFAULTS = { prompt: "", image_prompt_type: "", video_prompt_type: "", video_length: 124, force_fps: "", num_inference_steps: 8, sliding_window_size: 362, sliding_window_overlap: 18 };
const H3_SCHEMA = { model_def: { fps: 24, frames_minimum: 107, frames_steps: 17 } };

function h3Settings(durationSeconds: number, fps?: number) {
  const request = videoCreateRequestSchema.parse({ prompt: "A keeper crosses the gantry", modelKey: "minimax_h3_fl2va_pruned_pdd", durationSeconds, ...(fps ? { fps } : {}) });
  return buildVideoSettings(request, H3_DEFAULTS, H3_SCHEMA, "minimax_h3_fl2va_pruned_pdd");
}

describe("MiniMax H3 sliding windows", () => {
  it("lands the clip on H3's own 107 + 17k frame grid rather than LTX's", () => {
    // 15s x 24fps is 360 frames, which is not a length H3 accepts.
    expect(h3Settings(15).video_length).toBe(362);
    expect(h3Settings(20).video_length).toBe(481);
  });

  it("widens the window so a clip WanGP would split still renders in one pass", () => {
    // The stored default is 362; anything longer is split into windows that each
    // restart H3's timeline at [Shot 1].
    expect(h3Settings(16)).toMatchObject({ video_length: 379, sliding_window_size: 379 });
    expect(h3Settings(20)).toMatchObject({ video_length: 481, sliding_window_size: 481 });
  });

  it("never widens past the 481 frames H3 accepts, or narrows what WanGP already had", () => {
    expect(h3Settings(20, 60)).toMatchObject({ video_length: 1195, sliding_window_size: 481 });
    expect(h3Settings(5)).toMatchObject({ video_length: 124, sliding_window_size: 362 });
  });

  it("leaves a model that publishes no window alone", () => {
    const request = videoCreateRequestSchema.parse({ prompt: "Clouds", modelKey: "ltx2_22B", durationSeconds: 15 });
    const settings = buildVideoSettings(request, { prompt: "", video_length: 121, force_fps: 24 }, { model_def: { frames_minimum: 17, frames_steps: 8 } }, "ltx2_22B");
    expect(settings.video_length).toBe(361);
    expect(settings).not.toHaveProperty("sliding_window_size");
  });
});

describe("generic video settings", () => {
  it("builds text-to-video settings without requiring an image", () => {
    const request = videoCreateRequestSchema.parse({ prompt: "Clouds crossing a mountain", modelKey: "minimax_fixture", durationSeconds: 5, steps: 12 });
    const settings = buildVideoSettings(
      request,
      { prompt: "", negative_prompt: "", image_prompt_type: "SE", video_length: 81, force_fps: 24, num_inference_steps: 20 },
      {},
      "minimax_fixture",
    );

    expect(settings).toMatchObject({ prompt: "Clouds crossing a mountain", image_prompt_type: "", video_length: 121, num_inference_steps: 12 });
  });

  it("uses model-discovered start and end frame fields", () => {
    const request = videoCreateRequestSchema.parse({ prompt: "A smooth transition", modelKey: "video_fixture", durationSeconds: 5, sourceStrength: 0.4 });
    const settings = buildVideoSettings(
      request,
      { prompt: "", negative_prompt: "", image_prompt_type: "", input_video_strength: 0.8, video_length: 81, force_fps: 24 },
      { metadata: { media_inputs: { image: { start: true, end: true } } } },
      "video_fixture",
      "C:\\input\\start.png",
      "C:\\input\\end.png",
    );

    expect(settings).toMatchObject({ image_prompt_type: "SE", image_start: "C:\\input\\start.png", image_end: "C:\\input\\end.png", input_video_strength: 0.4 });
  });

  it("uses seconds directly when a model has no frame-count setting", () => {
    const request = videoCreateRequestSchema.parse({ prompt: "A short clip", modelKey: "seconds_fixture", durationSeconds: 7 });
    const settings = buildVideoSettings(request, { prompt: "", negative_prompt: "", duration_seconds: 4 }, {}, "seconds_fixture");

    expect(settings.duration_seconds).toBe(7);
  });
});