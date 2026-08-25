import { describe, expect, it } from "vitest";
import { normalizeWanGpPrompt, normalizeWanGpPromptSettings } from "@/lib/wan-gp/prompt";

describe("Wan2GP prompt normalization", () => {
  it("joins CRLF, LF, and blank paragraphs with one space", () => {
    expect(normalizeWanGpPrompt("  Opening line.\r\n\r\n  Middle line.\n Final line.  ")).toBe("Opening line. Middle line. Final line.");
  });

  it("normalizes every supported outbound prompt alias without changing other settings", () => {
    expect(normalizeWanGpPromptSettings({
      prompt: "One\nTwo",
      text_prompt: "Three\r\nFour",
      instruction: "Five\n\nSix",
      negative_prompt: "keep\nthis",
    })).toEqual({
      prompt: "One Two",
      text_prompt: "Three Four",
      instruction: "Five Six",
      negative_prompt: "keep\nthis",
    });
  });
});