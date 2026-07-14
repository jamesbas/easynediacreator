import path from "node:path";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => value === true || value === "true", z.boolean());
const optionalPath = z.preprocess((value) => typeof value === "string" && !value.trim() ? undefined : value, z.string().min(1).optional());
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().optional(),
  WANGP_MCP_URL: z.string().url().default("http://127.0.0.1:7866/mcp"),
  WANGP_OUTPUT_ROOT: z.string().min(1).default(path.join(process.cwd(), "data", "outputs")),
  WANGP_LORA_ROOT: optionalPath,
  WANGP_DISCOVERY_CACHE_MINUTES: z.coerce.number().int().min(1).default(30),
  WANGP_CLIENT_MODE: z.enum(["fake", "live"]).default("fake"),
  ENABLED_IMAGE_CREATE_MODELS: z.string().default("qwen-image,flux-klein-9b"),
  ENABLED_IMAGE_EDIT_MODELS: z.string().default("qwen-image-edit,flux-klein-9b"),
  ENABLED_VIDEO_MODELS: z.string().default("ltx-2"),
  DEFAULT_IMAGE_CREATE_MODEL: z.string().default("qwen-image"),
  DEFAULT_IMAGE_EDIT_MODEL: z.string().default("qwen-image-edit"),
  DEFAULT_VIDEO_MODEL: z.string().default("ltx-2"),
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
export const config = Object.freeze({
  ...env,
  enabledModels: {
    imageCreate: list(env.ENABLED_IMAGE_CREATE_MODELS),
    imageEdit: list(env.ENABLED_IMAGE_EDIT_MODELS),
    videoCreate: list(env.ENABLED_VIDEO_MODELS),
  },
});