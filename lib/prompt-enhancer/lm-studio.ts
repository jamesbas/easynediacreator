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
type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

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

let resolvedModel: { id: string; vision: boolean | undefined; at: number } | undefined;
const MODEL_CACHE_MS = 60_000;

/**
 * The model to send to, and whether it can read a picture.
 *
 * A pinned id wins. Without one we ask LM Studio which model is actually
 * resident — `/v1/models` lists what exists, `/api/v0/models` says what is
 * loaded — so the feature works from a base URL alone. Never cached for long:
 * the point of the reading is that a human may change it underneath us.
 *
 * `vision` is `undefined` rather than `false` when LM Studio does not answer,
 * because "we could not ask" and "it cannot see" call for different behaviour.
 */
export async function resolveModel(): Promise<{ id: string; vision: boolean | undefined } | undefined> {
  if (resolvedModel && Date.now() - resolvedModel.at < MODEL_CACHE_MS) return resolvedModel;
  const origin = restOrigin();
  const pinned = config.LM_STUDIO_MODEL;
  if (!origin) return pinned ? { id: pinned, vision: undefined } : undefined;
  try {
    const response = await fetch(`${origin}/api/v0/models`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return pinned ? { id: pinned, vision: undefined } : undefined;
    const body = (await response.json()) as { data?: { id?: unknown; state?: unknown; type?: unknown }[] };
    const models = (body.data ?? []).filter((model): model is { id: string; state?: string; type?: string } => typeof model.id === "string");
    const chosen = pinned ? models.find((model) => model.id === pinned) : models.find((model) => model.state === "loaded") ?? models[0];
    const id = chosen?.id ?? pinned;
    if (!id) return undefined;
    // LM Studio types a multimodal checkpoint `vlm` and a text-only one `llm`.
    const resolved = { id, vision: chosen?.type ? chosen.type === "vlm" : undefined, at: Date.now() };
    resolvedModel = resolved;
    return resolved;
  } catch {
    return pinned ? { id: pinned, vision: undefined } : undefined;
  }
}

export async function resolveModelId() {
  return (await resolveModel())?.id;
}

/** A server that rejects a response format says so in the message. */
function isFormatRejection(message: string) {
  return /response_format|json_schema|response format/i.test(message);
}

/** A text-only checkpoint names the image part it could not take. */
function isImageRejection(message: string) {
  return /image|vision|multimodal|mmproj/i.test(message);
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
  images?: { label: string; dataUrl: string }[];
}): Promise<CompletionResult<T>> {
  const baseUrl = config.LM_STUDIO_BASE_URL;
  if (!baseUrl) return { ok: false, reason: "not_configured", detail: "Set LM_STUDIO_BASE_URL to enable prompt enhancement." };
  const resolved = await resolveModel();
  if (!resolved) return { ok: false, reason: "no_model", detail: "No model is loaded in LM Studio. Load one, or set LM_STUDIO_MODEL." };
  const model = resolved.id;
  // A text-only checkpoint rejects an image part outright, so pictures are sent
  // only when LM Studio calls the model multimodal or will not say either way.
  let images = resolved.vision === false ? [] : options.images ?? [];
  if (images.length && resolved.vision === false) logger.info({ event: "prompt_enhancer.vision_unavailable", model }, "Loaded model cannot read images; enhancing from text alone");

  const call = async (format: ResponseFormat | null) => {
    const content: ContentPart[] = [{ type: "text", text: options.user }];
    for (const image of images) {
      content.push({ type: "text", text: image.label });
      content.push({ type: "image_url", image_url: { url: image.dataUrl } });
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.LM_STUDIO_API_KEY || "local"}` },
      cache: "no-store",
      signal: AbortSignal.timeout(config.LM_STUDIO_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: options.system }, { role: "user", content: images.length ? content : options.user }],
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
      // A server that will not take the pictures still writes a better prompt
      // than no rewrite at all, so they are dropped and the format retried.
      if (images.length && isImageRejection(message)) {
        logger.warn({ event: "prompt_enhancer.vision_rejected", model }, "LM Studio refused the images; enhancing from text alone");
        images = [];
        try {
          choice = (await call(format)).choices?.[0];
          continue;
        } catch (retryError) {
          lastError = retryError instanceof Error ? retryError.message : String(retryError);
        }
      }
      if (!isFormatRejection(lastError)) return { ok: false, reason: "request_failed", detail: lastError };
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
