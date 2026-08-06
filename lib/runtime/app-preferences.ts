import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CHARACTER_GENDERS, DEFAULT_CHARACTER_NAME, DEFAULT_CHARACTER_PROMPT, LEGACY_CHARACTER_ID, MAX_CHARACTERS, MAX_CHARACTER_NAME_LENGTH, MAX_CHARACTER_REFERENCES } from "@/lib/character-prompt";
import { config } from "@/lib/config";
import { loraSelectionSchema } from "@/lib/requests";

export const characterPromptSchema = z.string().max(4000, "Character prompt must be 4,000 characters or fewer.");
export const characterNameSchema = z.string().trim().min(1, "Give the character a name.").max(MAX_CHARACTER_NAME_LENGTH, `Character name must be ${MAX_CHARACTER_NAME_LENGTH} characters or fewer.`);
export const characterGenderSchema = z.enum(CHARACTER_GENDERS);

/** Default LoRAs are keyed by `${workflowType}:${modelKey}`, the same key the model selections use. */
export const MAX_DEFAULT_LORAS = 8;
export const defaultLoraSelectionKeySchema = z.string().min(1).max(100);
export const defaultLorasSchema = z.record(defaultLoraSelectionKeySchema, z.array(loraSelectionSchema).max(MAX_DEFAULT_LORAS));

export const characterReferenceSchema = z.object({
  id: z.string().uuid(),
  extension: z.enum(["jpg", "png", "webp"]),
  mime: z.string().min(1).max(100),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.string(),
});
export const characterSchema = z.object({
  id: z.string().uuid(),
  name: characterNameSchema,
  prompt: characterPromptSchema.default(""),
  gender: characterGenderSchema.default("female"),
  references: z.array(characterReferenceSchema).max(MAX_CHARACTER_REFERENCES).default([]),
  createdAt: z.string(),
});

function seedCharacter() {
  return [{ id: LEGACY_CHARACTER_ID, name: DEFAULT_CHARACTER_NAME, prompt: DEFAULT_CHARACTER_PROMPT, gender: "female" as const, references: [], createdAt: new Date(0).toISOString() }];
}

/** Folds the single `characterPrompt`/`characterReferences` pair written before the character library into the first character. */
function migrateLegacyCharacter(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const { characterPrompt, characterReferences, ...rest } = value as Record<string, unknown>;
  if (rest.characters !== undefined || (characterPrompt === undefined && characterReferences === undefined)) return rest;
  return { ...rest, characters: [{ id: LEGACY_CHARACTER_ID, name: DEFAULT_CHARACTER_NAME, prompt: characterPrompt ?? DEFAULT_CHARACTER_PROMPT, gender: "female", references: characterReferences ?? [], createdAt: new Date(0).toISOString() }] };
}

export const appPreferencesSchema = z.preprocess(migrateLegacyCharacter, z.object({
  characters: z.array(characterSchema).max(MAX_CHARACTERS).default(seedCharacter),
  defaultLoras: defaultLorasSchema.default({}),
}));

export type CharacterReference = z.infer<typeof characterReferenceSchema>;
export type Character = z.infer<typeof characterSchema>;
export type AppPreferences = z.infer<typeof appPreferencesSchema>;
const preferencesPath = path.join(config.DATA_ROOT, "app-preferences.json");

/** Drops the on-disk bookkeeping that client components have no use for. */
export function characterSummaries(characters: Character[]) {
  return characters.map((character) => ({ id: character.id, name: character.name, prompt: character.prompt, gender: character.gender, references: character.references.map((reference) => ({ id: reference.id, width: reference.width, height: reference.height })) }));
}

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