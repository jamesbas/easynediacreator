import pino from "pino";
import { config } from "@/lib/config";

const globalLogger = globalThis as unknown as { easyMediaLogger?: pino.Logger };
export const logger = globalLogger.easyMediaLogger ??= pino({ level: config.LOG_LEVEL, base: { app: "easy-media-generator" }, redact: ["passcode", "cookie", "prompt", "settings.prompt"] });