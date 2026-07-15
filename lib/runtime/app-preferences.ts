import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_CHARACTER_PROMPT } from "@/lib/character-prompt";

export const characterPromptSchema = z.string().max(4000, "Character prompt must be 4,000 characters or fewer.");
export const appPreferencesSchema = z.object({ characterPrompt: characterPromptSchema.default(DEFAULT_CHARACTER_PROMPT) });

export type AppPreferences = z.infer<typeof appPreferencesSchema>;
const preferencesPath = path.join(process.cwd(), "data", "app-preferences.json");

export async function getAppPreferences(): Promise<AppPreferences> {
  try {
    return appPreferencesSchema.parse(JSON.parse(await fs.readFile(preferencesPath, "utf8")));
  } catch {
    return appPreferencesSchema.parse({});
  }
}

export async function setAppPreferences(input: AppPreferences) {
  const preferences = appPreferencesSchema.parse(input);
  await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
  const temporaryPath = `${preferencesPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(preferences, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, preferencesPath);
  return preferences;
}