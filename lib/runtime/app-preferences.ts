import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_CHARACTER_PROMPT, MAX_CHARACTER_REFERENCES } from "@/lib/character-prompt";
import { config } from "@/lib/config";

export const characterPromptSchema = z.string().max(4000, "Character prompt must be 4,000 characters or fewer.");

export const characterReferenceSchema = z.object({
  id: z.string().uuid(),
  extension: z.enum(["jpg", "png", "webp"]),
  mime: z.string().min(1).max(100),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string(),
});
export const appPreferencesSchema = z.object({
  characterPrompt: characterPromptSchema.default(DEFAULT_CHARACTER_PROMPT),
  characterReferences: z.array(characterReferenceSchema).max(MAX_CHARACTER_REFERENCES).default([]),
});

export type CharacterReference = z.infer<typeof characterReferenceSchema>;
export type AppPreferences = z.infer<typeof appPreferencesSchema>;
const preferencesPath = path.join(config.DATA_ROOT, "app-preferences.json");

export async function getAppPreferences(): Promise<AppPreferences> {
  try {
    return appPreferencesSchema.parse(JSON.parse(await fs.readFile(preferencesPath, "utf8")));
  } catch {
    return appPreferencesSchema.parse({});
  }
}

/** Merges over what is stored, so saving one field cannot blank out the others. */
export async function setAppPreferences(input: Partial<AppPreferences>) {
  const preferences = appPreferencesSchema.parse({ ...await getAppPreferences(), ...input });
  await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
  const temporaryPath = `${preferencesPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, preferencesPath);
  return preferences;
}