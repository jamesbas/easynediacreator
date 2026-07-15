import { describe, expect, it } from "vitest";
import { getDefaultVideoDuration, videoDurationOptions } from "@/lib/wan-gp/video-options";

describe("video duration options", () => {
  it("offers every whole-second duration through 20 seconds", () => {
    expect(videoDurationOptions).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it("defaults the UI to fifteen seconds instead of inheriting stale WanGP values", () => {
    expect(getDefaultVideoDuration({ duration_seconds: 0, video_length: 481, force_fps: "" })).toBe(15);
  });
});