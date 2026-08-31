import type { ZodType } from "zod";
import { config } from "@/lib/config";
import { logger } from "@/lib/telemetry";

/**
 * A minimal OpenAI-compatible client for a local server (LM Studio, Ollama,
 * llama.cpp). Written against `fetch` rather than the OpenAI SDK so prompt
 * enhancement adds no runtime dependency: only the base URL differs between
 * those servers, and none of the SDK's hosted-API machinery is used here.
 *
 * Every failure returns a reason rather than throwing, because enhancement is
 * an enhancement — the form has to stay usable when the box running the model
 * is switched off.
 */

export type EnhancerFailure =
  | "not_configured"
  | "no_model"
  | "request_failed"
  | "empty_response"
  | "unparseable_json"
  | "schema_mismatch";

export type CompletionResult<T> = { ok: true; value: T; model: string } | { ok: false; reason: EnhancerFailure; detail: string };

type ResponseFormat = { type: "text" } | { type: "json_object" } | { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } };
type ChatChoice = { message?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null };

/**
 * How we ask for JSON, best first.
 *
 * `json_schema` constrains generation to the exact shape, which is what makes a
 * small local model reliable — without it they return plausible JSON with the
 * wrong keys. LM Studio accepts `json_schema` and `text` but rejects
 * `json_object`, which is the mode most OpenAI example code reaches for, so the
 * ladder discovers that once per process and then skips it.
 */
const FORMAT_LADDER = ["json_schema", "json_object", "text"] as const;
type FormatKind = (typeof FORMAT_LADDER)[number];
const unsupportedFormats = new Set<FormatKind>();

export function isPromptEnhancerConfigured() {
  return Boolean(config.LM_STUDIO_BASE_URL);
}

/** LM Studio's native API sits at `/api/v0` on the same origin as the `/v1` one. */
function restOrigin() {
  try {
    return config.LM_STUDIO_BASE_URL ? new URL(config.LM_STUDIO_BASE_URL).origin : undefined;
  } catch {
    return undefined;
  }
}

let resolvedModel: { id: string; at: number } | undefined;
const MODEL_CACHE_MS = 60_000;

/**
 * The model to send to.
 *
 * A pinned id wins. Without one we ask LM Studio which model is actually
 * resident — `/v1/models` lists what exists, `/api/v0/models` says what is
 * loaded — so the feature works from a base URL alone. Never cached for long:
 * the point of the reading is that a human may change it underneath us.
 */
export async function resolveModelId(): Promise<string | undefined> {
  if (config.LM_STUDIO_MODEL) return config.LM_STUDIO_MODEL;
  if (resolvedModel && Date.now() - resolvedModel.at < MODEL_CACHE_MS) return resolvedModel.id;
  const origin = restOrigin();
  if (!origin) return undefined;
  try {
    const response = await fetch(`${origin}/api/v0/models`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { data?: { id?: unknown; state?: unknown }[] };
    const models = (body.data ?? []).filter((model): model is { id: string; state?: string } => typeof model.id === "string");
    const id = models.find((model) => model.state === "loaded")?.id ?? models[0]?.id;
    if (id) resolvedModel = { id, at: Date.now() };
    return id;
  } catch {
    return undefined;
  }
}

/** A server that rejects a response format says so in the message. */
function isFormatRejection(message: string) {
  return /response_format|json_schema|response format/i.test(message);
}

/**
 * Pull an object out of whatever the model actually said.
 *
 * Reasoning models inline their thinking as a `<think>` block or split it into
 * `reasoning_content`; instruction-tuned models wrap answers in code fences.
 * Neither is an error, so both are unwrapped before parsing.
 */
export function extractJson(content: string): unknown {
  const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "");
  const unfenced = withoutThinking.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
  try {
    return JSON.parse(candidate);
  } catch {
    return undefined;
  }
}

export async function completeJson<T>(options: {
  system: string;
  user: string;
  schema: ZodType<T>;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}): Promise<CompletionResult<T>> {
  const baseUrl = config.LM_STUDIO_BASE_URL;
  if (!baseUrl) return { ok: false, reason: "not_configured", detail: "Set LM_STUDIO_BASE_URL to enable prompt enhancement." };
  const model = await resolveModelId();
  if (!model) return { ok: false, reason: "no_model", detail: "No model is loaded in LM Studio. Load one, or set LM_STUDIO_MODEL." };

  const call = async (format: ResponseFormat | null) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.LM_STUDIO_API_KEY || "local"}` },
      cache: "no-store",
      signal: AbortSignal.timeout(config.LM_STUDIO_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: options.system }, { role: "user", content: options.user }],
        ...(format ? { response_format: format } : {}),
        temperature: config.LM_STUDIO_TEMPERATURE,
        // Reasoning models spend this budget thinking before any content.
        max_tokens: config.LM_STUDIO_MAX_TOKENS,
      }),
    });
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 300)}`);
    return (await response.json()) as { choices?: ChatChoice[] };
  };

  let choice: ChatChoice | undefined;
  let lastError = "";
  for (const kind of FORMAT_LADDER) {
    if (choice) break;
    if (unsupportedFormats.has(kind)) continue;
    const format: ResponseFormat = kind === "json_schema"
      ? { type: "json_schema", json_schema: { name: options.schemaName, strict: true, schema: options.jsonSchema } }
      : { type: kind };
    try {
      choice = (await call(format)).choices?.[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      if (!isFormatRejection(message)) return { ok: false, reason: "request_failed", detail: message };
      // A rejected format is a fact about the server, so it holds for later calls.
      unsupportedFormats.add(kind);
      logger.warn({ event: "prompt_enhancer.format_unsupported", format: kind }, "LM Studio rejected a response format");
    }
  }
  if (!choice) return { ok: false, reason: "request_failed", detail: lastError || "No usable response format." };

  const content = choice.message?.content ?? "";
  if (!content.trim()) {
    const truncated = choice.finish_reason === "length";
    return { ok: false, reason: "empty_response", detail: truncated ? "The model spent its whole token budget thinking. Raise LM_STUDIO_MAX_TOKENS." : "The model returned nothing." };
  }
  const parsed = extractJson(content);
  if (parsed === undefined) {
    return { ok: false, reason: "unparseable_json", detail: choice.finish_reason === "length" ? "The response was cut short. Raise LM_STUDIO_MAX_TOKENS." : "The model did not answer with JSON." };
  }
  const validated = options.schema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues.slice(0, 2).map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`).join("; ");
    return { ok: false, reason: "schema_mismatch", detail: issues };
  }
  return { ok: true, value: validated.data, model };
}

/** Tests and server swaps: forget which formats the last server refused. */
export function resetResponseFormatNegotiation() {
  unsupportedFormats.clear();
  resolvedModel = undefined;
}

/** Called after the runtime evicts every model, so the next call re-reads residency. */
export function forgetResolvedModel() {
  resolvedModel = undefined;
}
