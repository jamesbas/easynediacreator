import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "@/lib/config";
import { forgetResolvedModel } from "@/lib/prompt-enhancer/lm-studio";
import { logger } from "@/lib/telemetry";

/**
 * Control of the local LM Studio runtime.
 *
 * Prompt enhancement and generation compete for the same GPU, and LM Studio
 * holds its model resident long after a rewrite finishes — its default idle TTL
 * is an hour — so the next WanGP render finds no VRAM and dies with an
 * out-of-memory hint. Evicting the language model before a job is submitted is
 * what lets the two halves coexist on one card.
 *
 * Residency is read over LM Studio's REST API; unloading goes through its `lms`
 * CLI, which is the only interface that exposes it.
 */

const run = promisify(execFile);

/** A missing CLI is a standing condition, so it is reported once rather than per job. */
let cliMissingReported = false;

export function isRuntimeControlEnabled() {
  return Boolean(config.LM_STUDIO_BASE_URL) && config.LM_STUDIO_UNLOAD_BEFORE_GENERATION;
}

/** LM Studio's native API sits at `/api/v0` on the same origin as the `/v1` one. */
function restOrigin() {
  try {
    return config.LM_STUDIO_BASE_URL ? new URL(config.LM_STUDIO_BASE_URL).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Which models are resident right now.
 *
 * Never cached: the whole point of the reading is that it changes underneath us
 * — a model can be loaded from LM Studio's own window between two calls. An
 * unreachable server means nothing is holding VRAM we can free, which is a
 * normal state rather than an error.
 */
export async function getLoadedModels(): Promise<string[]> {
  const origin = restOrigin();
  if (!origin) return [];
  try {
    const response = await fetch(`${origin}/api/v0/models`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const body = (await response.json()) as { data?: { id?: unknown; state?: unknown }[] };
    return (body.data ?? []).filter((model) => model.state === "loaded").map((model) => (typeof model.id === "string" ? model.id : "")).filter(Boolean);
  } catch {
    return [];
  }
}

async function lms(args: string[]) {
  // execFile, not exec: arguments are passed as an array with no shell, and the
  // path comes from configuration rather than from any request.
  const { stdout, stderr } = await run(config.LM_STUDIO_CLI_PATH, args, { timeout: config.LM_STUDIO_CLI_TIMEOUT_MS, windowsHide: true });
  return `${stdout}${stderr}`.trim();
}

/**
 * Evict every loaded language model so the GPU is free for the render.
 *
 * Total by design: a generation must never fail because the machine that writes
 * prompts could not be reached. The worst case is the out-of-memory this exists
 * to prevent, which is no worse than not trying.
 */
export async function releaseGpuForGeneration(context: { jobId: string }): Promise<string[]> {
  if (!isRuntimeControlEnabled()) return [];
  const loaded = await getLoadedModels();
  if (!loaded.length) return [];
  try {
    const output = await lms(["unload", "--all"]);
    forgetResolvedModel();
    logger.info({ event: "llm.runtime.unloaded", ...context, models: loaded, output: output.slice(0, 200) }, "Evicted LM Studio models before generation");
    return loaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/ENOENT/.test(message)) {
      if (!cliMissingReported) {
        cliMissingReported = true;
        logger.warn({ event: "llm.runtime.cli_missing", cliPath: config.LM_STUDIO_CLI_PATH }, "Could not find the LM Studio CLI (`lms`); the GPU will not be freed before generation");
      }
      return [];
    }
    logger.warn({ event: "llm.runtime.unload_failed", ...context, message }, "Could not evict LM Studio models before generation");
    return [];
  }
}

export function resetRuntimeWarningsForTests() {
  cliMissingReported = false;
}
