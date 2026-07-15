import { describe, expect, it } from "vitest";
import { modelListSchema, parseLoraCatalog, parseLoraCatalogResponse, parseWanGpJobSnapshot, parseWanGpStructuredContent, parseWanGpTextContent } from "@/lib/wan-gp/schemas";

describe("WanGP MCP response normalization", () => {
  it("normalizes upstream snake-case model metadata", () => {
    expect(modelListSchema.parse([{ model_type: "ltx2_22B", name: "LTX-2", family: "ltx2", main_output: "video", inputs: ["text", "image"] }])[0]).toMatchObject({ modelType: "ltx2_22B", output: "video" });
  });

  it("normalizes current array-valued output metadata", () => {
    expect(modelListSchema.parse([{ model_type: "ltx2_22B", name: "LTX-2", family: "ltx2", main_output: ["video"], inputs: ["text", "image"], availability: { status: "available" } }])[0]).toMatchObject({ modelType: "ltx2_22B", output: "video", availability: "available" });
  });

  it("combines FastMCP list results returned as separate text blocks", () => {
    expect(parseWanGpTextContent([
      { type: "text", text: JSON.stringify({ model_type: "qwen_image_20B" }) },
      { type: "text", text: JSON.stringify({ model_type: "ltx2_22B" }) },
    ])).toEqual([{ model_type: "qwen_image_20B" }, { model_type: "ltx2_22B" }]);
  });

  it("unwraps FastMCP structured results without unwrapping job snapshots", () => {
    expect(parseWanGpStructuredContent({ result: [{ model_type: "ltx2_22B" }] })).toEqual([{ model_type: "ltx2_22B" }]);
    const snapshot = { job_id: "abc", done: true, result: { success: true } };
    expect(parseWanGpStructuredContent(snapshot)).toBe(snapshot);
  });

  it("extracts safe LoRA filenames from supported catalog shapes", () => {
    expect(parseLoraCatalog({ loras: ["style.safetensors", { filename: "motion.sft" }, "../unsafe.safetensors"] })).toEqual(["motion.sft", "style.safetensors"]);
  });

  it("normalizes native typed acceleration presets", () => {
    const catalog = parseLoraCatalogResponse({ loras: ["lightning.safetensors"], acceleration_presets: [{ id: "fast", label: "Fast 4", workflow_types: ["image-create"], loras: [{ filename: "lightning.safetensors", multiplier: 1 }], settings: { num_inference_steps: 4, guidance_scale: 1 } }] }, "qwen_image_20B");
    expect(catalog.accelerationPresets?.[0]).toMatchObject({ id: "fast", modelTypes: ["qwen_image_20B"], workflowTypes: ["image-create"], settings: { numInferenceSteps: 4, guidanceScale: 1 }, source: "mcp", confidence: "authoritative" });
  });

  it("normalizes completed MCP job snapshots and generated files", () => {
    expect(parseWanGpJobSnapshot({ job_id: "abc", done: true, cancel_requested: false, events: [], result: { success: true, cancelled: false, generated_files: ["C:\\outputs\\clip.mp4"], errors: [] } })).toMatchObject({ id: "abc", status: "completed", outputPaths: ["C:\\outputs\\clip.mp4"] });
  });
});