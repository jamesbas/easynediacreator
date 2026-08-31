import { describe, expect, it } from "vitest";

const runLive = process.env.LM_STUDIO_LIVE_TEST === "true";

/**
 * Exercises the real language model, so it stays out of the default run.
 *
 *   $env:LM_STUDIO_LIVE_TEST="true"; npx vitest run tests/prompt-enhancer.manual.test.ts
 *
 * `lib/config.ts` reads the environment once at module load, so the LM Studio
 * settings have to be in place before the module graph is imported — which is
 * why the imports here are dynamic.
 */
describe.runIf(runLive)("live LM Studio prompt enhancement", () => {
  it("names the model that will answer", async () => {
    const { resolveModelId } = await import("@/lib/prompt-enhancer/lm-studio");
    await expect(resolveModelId()).resolves.toEqual(expect.any(String));
  }, 30_000);

  it("rewrites an image prompt for the family that renders it", async () => {
    const { enhancePrompt } = await import("@/lib/prompt-enhancer/enhance");
    const result = await enhancePrompt({
      workflowType: "image-create",
      modelKey: "qwen-image",
      prompt: "a lighthouse keeper watching a storm",
      durationSeconds: 15,
      hasStartFrame: false,
      hasEndFrame: false,
      hasSourceImage: false,
      referenceCount: 0,
    });
    expect(result.prompt.length).toBeGreaterThan("a lighthouse keeper watching a storm".length);
    expect(result.prompt.length).toBeLessThanOrEqual(4000);
  }, 300_000);

  it("puts a MiniMax H3 clip in the labelled envelope", async () => {
    const { enhancePrompt } = await import("@/lib/prompt-enhancer/enhance");
    const result = await enhancePrompt({
      workflowType: "video-create",
      modelKey: "minimax_h3_fl2va_pruned_pdd",
      prompt: "a lighthouse keeper crosses the gantry as the storm hits",
      durationSeconds: 15,
      hasStartFrame: true,
      hasEndFrame: true,
      hasSourceImage: false,
      referenceCount: 0,
    });
    expect(result.family).toBe("minimax");
    expect(result.prompt).toMatch(/^How the reference pictures align with the target video/);
    expect(result.prompt).toContain("integrated_multimodal_description: [Shot 1]");
    expect(result.prompt).toContain("overall_soundscape:");
    expect(result.prompt).toContain("non_diegetic_music:");
    expect(result.prompt.length).toBeLessThanOrEqual(4000);
  }, 300_000);

  // Last, because it ejects the model the cases above rely on. LM Studio loads
  // it again on the next request.
  it("ejects the model from the GPU the way a generation would", async () => {
    const { getLoadedModels, releaseGpuForGeneration } = await import("@/lib/services/llm-runtime");
    expect(await getLoadedModels()).not.toHaveLength(0);
    await expect(releaseGpuForGeneration({ jobId: "manual" })).resolves.not.toHaveLength(0);
    await expect(getLoadedModels()).resolves.toEqual([]);
  }, 120_000);
});
