import { describe, expect, it } from "vitest";
import { videoCreateRequestSchema } from "@/lib/requests";
import { buildVideoSettings } from "@/lib/wan-gp/adapters/video";

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