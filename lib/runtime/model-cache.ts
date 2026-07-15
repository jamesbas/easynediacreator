import type { ModelOption } from "@/lib/types";
import { config } from "@/lib/config";
import { getWanGpClient } from "@/lib/wan-gp";
import { discoverModels } from "@/lib/wan-gp/discovery";
import { getLocalLoraFingerprint } from "@/lib/wan-gp/local-lora-catalog";
import { getClassifierFingerprint } from "@/lib/wan-gp/lora-classifier/classify";
import { getModelSelections } from "@/lib/runtime/model-preferences";

type Cache = { models: ModelOption[]; refreshedAt: number; loraFingerprint?: string; classifierFingerprint?: string };
const globalCache = globalThis as unknown as { easyMediaModelCache?: Cache };

export async function getModels(force = false) {
  const maxAge = config.WANGP_DISCOVERY_CACHE_MINUTES * 60_000;
  const loraFingerprint = await getLocalLoraFingerprint(config.WANGP_LORA_ROOT);
  const classifierFingerprint = await getClassifierFingerprint(config.WANGP_PROFILES_ROOT, config.WANGP_LORA_METADATA_ROOT, config.WANGP_LORA_CLASSIFIER_OVERRIDES);
  if (!force && globalCache.easyMediaModelCache && globalCache.easyMediaModelCache.loraFingerprint === loraFingerprint && globalCache.easyMediaModelCache.classifierFingerprint === classifierFingerprint && Date.now() - globalCache.easyMediaModelCache.refreshedAt < maxAge) return globalCache.easyMediaModelCache.models;
  const models = await discoverModels(getWanGpClient(), await getModelSelections());
  globalCache.easyMediaModelCache = { models, refreshedAt: Date.now(), loraFingerprint, classifierFingerprint };
  return models;
}

export function clearModelCache() { delete globalCache.easyMediaModelCache; }