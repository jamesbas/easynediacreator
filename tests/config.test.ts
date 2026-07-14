import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";

describe("configuration", () => {
  it("parses model allow-lists and conservative queue defaults", () => {
    expect(config.enabledModels.imageCreate).toEqual(["qwen-image", "flux-klein-9b"]);
    expect(config.enabledModels.videoCreate).toEqual(["ltx-2"]);
    expect(config.MAX_ACTIVE_GENERATION_JOBS).toBe(1);
  });
});