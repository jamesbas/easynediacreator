import type { ModelOption } from "@/lib/types";
import { config } from "@/lib/config";
import { getWanGpClient } from "@/lib/wan-gp";
import { discoverModels } from "@/lib/wan-gp/discovery";

type Cache = { models: ModelOption[]; refreshedAt: number };
const globalCache = globalThis as unknown as { easyMediaModelCache?: Cache };

export async function getModels(force = false) {
  const maxAge = config.WANGP_DISCOVERY_CACHE_MINUTES * 60_000;
  if (!force && globalCache.easyMediaModelCache && Date.now() - globalCache.easyMediaModelCache.refreshedAt < maxAge) return globalCache.easyMediaModelCache.models;
  const models = await discoverModels(getWanGpClient());
  globalCache.easyMediaModelCache = { models, refreshedAt: Date.now() };
  return models;
}