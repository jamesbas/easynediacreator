import path from "node:path";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => value === true || value === "true", z.boolean());
const blankToUndefined = (value: unknown) => typeof value === "string" && !value.trim() ? undefined : value;
const optionalPath = z.preprocess(blankToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().optional(),
  WANGP_MCP_URL: z.string().url().default("http://127.0.0.1:7866/mcp"),
  /** Where saved settings, uploads, and generated media live. */
  DATA_ROOT: z.string().min(1).default(path.join(process.cwd(), "data")),
  WANGP_OUTPUT_ROOT: z.string().min(1).default(path.join(process.cwd(), "data", "outputs")),
  WANGP_LORA_ROOT: optionalPath,
  WANGP_PROFILES_ROOT: optionalPath,
  WANGP_LORA_METADATA_ROOT: optionalPath,
  WANGP_LORA_CLASSIFIER_OVERRIDES: optionalPath,
  WANGP_DISCOVERY_CACHE_MINUTES: z.coerce.number().int().min(1).default(30),
  WANGP_CLIENT_MODE: z.enum(["fake", "live"]).default("fake"),
  ENABLED_IMAGE_CREATE_MODELS: z.string().default("qwen-image,flux-klein-9b,krea-2"),
  ENABLED_IMAGE_EDIT_MODELS: z.string().default("qwen-image-edit,flux-klein-9b,krea-2-edit"),
  DEFAULT_IMAGE_CREATE_MODEL: z.string().default("qwen-image"),
  DEFAULT_IMAGE_EDIT_MODEL: z.string().default("qwen-image-edit"),
  DEFAULT_VIDEO_MODEL: z.string().default("minimax_h3_fl2va_pruned_pdd"),
  /** Prompt enhancement is off until an OpenAI-compatible local server (LM Studio) is named. */
  LM_STUDIO_BASE_URL: optionalUrl,
  /** Empty asks LM Studio which model is loaded rather than pinning one. */
  LM_STUDIO_MODEL: z.string().default(""),
  LM_STUDIO_API_KEY: z.string().default("local"),
  LM_STUDIO_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  /** Reasoning models spend this budget thinking before they emit any content. */
  LM_STUDIO_MAX_TOKENS: z.coerce.number().int().min(256).max(64_000).default(8000),
  LM_STUDIO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(900_000).default(240_000),
  /** LM Studio puts `lms` on PATH; override for unusual installs. */
  LM_STUDIO_CLI_PATH: z.string().min(1).default("lms"),
  LM_STUDIO_CLI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),
  /** Planning and generation want the same GPU, so the language model is evicted before a render. */
  LM_STUDIO_UNLOAD_BEFORE_GENERATION: booleanFromEnv.default(true),
  MAX_ACTIVE_GENERATION_JOBS: z.coerce.number().int().min(1).max(4).default(1),
  MAX_QUEUED_JOBS: z.coerce.number().int().min(1).max(100).default(20),
  MAX_IMAGE_UPLOAD_MB: z.coerce.number().positive().max(100).default(25),
  MAX_VIDEO_OUTPUT_MB: z.coerce.number().positive().default(1000),
  ENABLE_LOCAL_PASSCODE: booleanFromEnv.default(false),
  LOCAL_PASSCODE_HASH: z.string().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
}).superRefine((value, context) => {
  if (value.ENABLE_LOCAL_PASSCODE && !value.LOCAL_PASSCODE_HASH.startsWith("$argon2id$")) context.addIssue({ code: "custom", path: ["LOCAL_PASSCODE_HASH"], message: "Passcode protection requires an Argon2id hash." });
});

function list(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

const env = envSchema.parse(process.env);
const wanGpRoot = env.WANGP_LORA_ROOT ? path.dirname(path.resolve(env.WANGP_LORA_ROOT)) : undefined;
export const config = Object.freeze({
  ...env,
  WANGP_PROFILES_ROOT: env.WANGP_PROFILES_ROOT ?? (wanGpRoot ? path.join(wanGpRoot, "profiles") : undefined),
  WANGP_LORA_METADATA_ROOT: env.WANGP_LORA_METADATA_ROOT ?? (wanGpRoot ? path.join(wanGpRoot, "loras_metadata") : undefined),
  WANGP_LORA_CLASSIFIER_OVERRIDES: env.WANGP_LORA_CLASSIFIER_OVERRIDES ?? path.join(process.cwd(), "data", "lora-classifier-overrides.json"),
  enabledModels: {
    imageCreate: list(env.ENABLED_IMAGE_CREATE_MODELS),
    imageEdit: list(env.ENABLED_IMAGE_EDIT_MODELS),
  },
});