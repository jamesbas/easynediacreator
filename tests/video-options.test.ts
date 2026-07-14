import { describe, expect, it } from "vitest";
import { getDefaultVideoDuration, videoDurationOptions } from "@/lib/wan-gp/video-options";

describe("video duration options", () => {
  it("offers every whole-second duration through 20 seconds", () => {
    expect(videoDurationOptions).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it("derives a five-second default from 121 frames at 24 fps", () => {
    expect(getDefaultVideoDuration({ video_length: 121, fps: 24 })).toBe(5);
  });

  it("uses WanGP's current force_fps setting", () => {
    expect(getDefaultVideoDuration({ video_length: 121, force_fps: "30" })).toBe(4);
  });
});