import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Freeing the GPU before a render.
 *
 * The unload itself shells out to LM Studio's `lms` CLI, so what is worth
 * pinning is that it is only reached when there is something to unload, and
 * that nothing here can fail a generation: an unreachable LM Studio, a missing
 * CLI or a failing one all have to degrade to "we could not free the VRAM"
 * rather than to a lost job.
 *
 * `lib/config.ts` reads the environment once at module load, so each case sets
 * the environment and then imports the service fresh.
 */

const cli = vi.hoisted(() => {
  const state = { error: null as Error | null, stdout: "" };
  const calls: { file: string; args: string[] }[] = [];
  // `execFile` is consumed through `promisify`, which honours this symbol, so
  // the stub resolves the same `{ stdout, stderr }` shape the real one does.
  const execFile = Object.assign(() => undefined, {
    [Symbol.for("nodejs.util.promisify.custom")]: async (file: string, args: string[]) => {
      calls.push({ file, args });
      if (state.error) throw state.error;
      return { stdout: state.stdout, stderr: "" };
    },
  });
  return { execFile, state, calls };
});
vi.mock("node:child_process", () => ({ execFile: cli.execFile }));

async function loadService(env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("LM_STUDIO_BASE_URL", "http://127.0.0.1:1234/v1");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("@/lib/services/llm-runtime");
}

function residentModels(...ids: string[]) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: ids.map((id) => ({ id, state: "loaded" })) })));
}

beforeEach(() => {
  cli.calls.length = 0;
  cli.state.error = null;
  cli.state.stdout = "Unloaded 1 model";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("evicting the language model before a render", () => {
  it("unloads every resident model and says which ones went", async () => {
    residentModels("planner-27b");
    const { releaseGpuForGeneration } = await loadService();
    await expect(releaseGpuForGeneration({ jobId: "job-1" })).resolves.toEqual(["planner-27b"]);
    expect(cli.calls).toEqual([{ file: "lms", args: ["unload", "--all"] }]);
  });

  it("does not spawn anything when nothing is holding the GPU", async () => {
    residentModels();
    const { releaseGpuForGeneration } = await loadService();
    await expect(releaseGpuForGeneration({ jobId: "job-1" })).resolves.toEqual([]);
    expect(cli.calls).toHaveLength(0);
  });

  it("stays out of the way when LM Studio is not configured", async () => {
    residentModels("planner-27b");
    vi.resetModules();
    vi.stubEnv("LM_STUDIO_BASE_URL", "");
    const { isRuntimeControlEnabled, releaseGpuForGeneration } = await import("@/lib/services/llm-runtime");
    expect(isRuntimeControlEnabled()).toBe(false);
    await expect(releaseGpuForGeneration({ jobId: "job-1" })).resolves.toEqual([]);
    expect(cli.calls).toHaveLength(0);
  });

  it("can be turned off without giving up prompt enhancement", async () => {
    residentModels("planner-27b");
    const { isRuntimeControlEnabled, releaseGpuForGeneration } = await loadService({ LM_STUDIO_UNLOAD_BEFORE_GENERATION: "false" });
    expect(isRuntimeControlEnabled()).toBe(false);
    await expect(releaseGpuForGeneration({ jobId: "job-1" })).resolves.toEqual([]);
    expect(cli.calls).toHaveLength(0);
  });

  it("treats an unreachable LM Studio as nothing to free rather than an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));
    const { getLoadedModels, releaseGpuForGeneration } = await loadService();
    await expect(getLoadedModels()).resolves.toEqual([]);
    await expect(releaseGpuForGeneration({ jobId: "job-1" })).resolves.toEqual([]);
    expect(cli.calls).toHaveLength(0);
  });

  it("never fails the job when the CLI is missing or refuses", async () => {
    residentModels("planner-27b");
    const { releaseGpuForGeneration } = await loadService();

    cli.state.error = new Error("spawn lms ENOENT");
    await expect(releaseGpuForGeneration({ jobId: "job-1" })).resolves.toEqual([]);

    cli.state.error = new Error("Command failed: lms unload --all");
    await expect(releaseGpuForGeneration({ jobId: "job-2" })).resolves.toEqual([]);
    expect(cli.calls).toHaveLength(2);
  });
});
