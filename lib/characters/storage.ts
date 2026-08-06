import fs from "node:fs/promises";
import path from "node:path";
import { MAX_CHARACTERS, MAX_CHARACTER_REFERENCES } from "@/lib/character-prompt";
import { config } from "@/lib/config";
import { assertPathInsideRoot } from "@/lib/security/path-policy";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { characterSchema, characterReferenceSchema, getAppPreferences, setAppPreferences, type CharacterReference } from "@/lib/runtime/app-preferences";
import type { CharacterGender } from "@/lib/character-prompt";

/**
 * The named character library and its reference photographs.
 *
 * Unlike generation uploads these outlive a session, so the files sit in their
 * own folder and the index rides along in `app-preferences.json`. Filenames are
 * built from a server-generated id plus the extension the decoder reported, never
 * from anything the client sent, so a crafted upload name cannot reach the disk.
 */
export const characterReferenceRoot = path.resolve(config.DATA_ROOT, "character-references");

export function characterReferencePath(reference: Pick<CharacterReference, "id" | "extension">) {
  return path.join(characterReferenceRoot, `${reference.id}.${reference.extension}`);
}

export async function listCharacters() {
  return (await getAppPreferences()).characters;
}

/** Every reference image across the library, flattened for id lookups. */
export async function listCharacterReferences() {
  return (await listCharacters()).flatMap((character) => character.references);
}

export async function createCharacter(input: { name: string; prompt?: string; gender?: CharacterGender }) {
  const existing = await listCharacters();
  if (existing.length >= MAX_CHARACTERS) throw new Error(`Keep at most ${MAX_CHARACTERS} characters.`);
  const character = characterSchema.parse({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), name: input.name, prompt: input.prompt ?? "", gender: input.gender ?? "female", references: [] });
  await setAppPreferences({ characters: [...existing, character] });
  return character;
}

export async function updateCharacter(id: string, input: { name?: string; prompt?: string; gender?: CharacterGender }) {
  const existing = await listCharacters();
  const current = existing.find((candidate) => candidate.id === id);
  if (!current) throw new Error("Character was not found.");
  const updated = characterSchema.parse({ ...current, ...input });
  await setAppPreferences({ characters: existing.map((candidate) => (candidate.id === id ? updated : candidate)) });
  return updated;
}

export async function removeCharacter(id: string) {
  const existing = await listCharacters();
  const character = existing.find((candidate) => candidate.id === id);
  if (!character) throw new Error("Character was not found.");
  const characters = existing.filter((candidate) => candidate.id !== id);
  await setAppPreferences({ characters });
  for (const reference of character.references) await fs.rm(characterReferencePath(reference), { force: true });
  return characters;
}

export async function addCharacterReference(characterId: string, buffer: Buffer) {
  const existing = await listCharacters();
  const character = existing.find((candidate) => candidate.id === characterId);
  if (!character) throw new Error("Character was not found.");
  if (character.references.length >= MAX_CHARACTER_REFERENCES) throw new Error(`Keep at most ${MAX_CHARACTER_REFERENCES} reference images per character.`);
  const metadata = await validateImageBuffer(buffer);
  const reference = characterReferenceSchema.parse({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...metadata });
  await fs.mkdir(characterReferenceRoot, { recursive: true });
  await fs.writeFile(characterReferencePath(reference), buffer, { flag: "wx" });
  await setAppPreferences({ characters: existing.map((candidate) => (candidate.id === characterId ? { ...candidate, references: [...candidate.references, reference] } : candidate)) });
  return reference;
}

export async function removeCharacterReference(id: string) {
  const existing = await listCharacters();
  const reference = existing.flatMap((character) => character.references).find((candidate) => candidate.id === id);
  if (!reference) throw new Error("Character reference image was not found.");
  const characters = existing.map((character) => ({ ...character, references: character.references.filter((candidate) => candidate.id !== id) }));
  await setAppPreferences({ characters });
  await fs.rm(characterReferencePath(reference), { force: true });
  return characters;
}

/** Absolute paths for the selected reference images, in the order they were requested. */
export async function resolveCharacterReferencePaths(ids: string[]) {
  if (!ids.length) return [];
  const references = await listCharacterReferences();
  return ids.map((id) => {
    const reference = references.find((candidate) => candidate.id === id);
    if (!reference) throw new Error("A character reference image could not be found.");
    return assertPathInsideRoot(characterReferencePath(reference), characterReferenceRoot);
  });
}
