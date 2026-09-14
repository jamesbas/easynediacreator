import { describe, expect, it } from "vitest";
import { asyncGenerationAllowed, isTerminalGenerationResult, normalizeV2Metadata, parseV2TerminalResult } from "@/lib/wan-gp/api-v2";

describe("WanGP MCP API v2 normalization", () => {
  it("expands media-role arrays into the nested flags the adapters read", () => {
    expect(normalizeV2Metadata({
      capabilities: ["text_to_image", "reference_images"],
      media_inputs: { image: ["reference", "mask"], video: [] },
    })).toEqual({
      capabilities: ["text_to_image", "reference_images"],
      media_inputs: { image: { reference: true, mask: true }, video: {} },
    });
  });

  it("treats a constant wait parameter as asynchronous generation being disabled", () => {
    const contract = (wait: unknown) => ({ action: { parameters: { properties: { wait } } } });
    expect(asyncGenerationAllowed(contract({ type: "boolean", default: true, const: true }))).toBe(false);
    expect(asyncGenerationAllowed(contract({ type: "boolean", default: true }))).toBe(true);
    expect(asyncGenerationAllowed({})).toBe(true);
  });

  it("normalizes a synchronous generation result", () => {
    expect(parseV2TerminalResult({ job_id: "job-1", done: true, result: { success: true, generated_files: ["C:\\out\\clip.mp4"] } }, "fallback"))
      .toMatchObject({ id: "job-1", status: "completed", outputPaths: ["C:\\out\\clip.mp4"] });
    expect(parseV2TerminalResult({ done: true, result: { success: false, errors: [{ message: "Out of memory" }] } }, "fallback"))
      .toMatchObject({ id: "fallback", status: "failed", error: "Out of memory" });
  });

  it("detects a bounded wait that returned before the job finished", () => {
    expect(isTerminalGenerationResult({ job_id: "job-1", done: false })).toBe(false);
    expect(isTerminalGenerationResult({ job_id: "job-1", done: true, result: { success: true } })).toBe(true);
  });
});
