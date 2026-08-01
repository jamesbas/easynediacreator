import fs from "node:fs/promises";
import path from "node:path";
import { MAX_CHARACTER_REFERENCES } from "@/lib/character-prompt";
import { config } from "@/lib/config";
import { assertPathInsideRoot } from "@/lib/security/path-policy";
import { validateImageBuffer } from "@/lib/uploads/validate-image";
import { characterReferenceSchema, getAppPreferences, setAppPreferences, type CharacterReference } from "@/lib/runtime/app-preferences";

/**
 * Reference photographs for the saved character prompt.
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

export async function listCharacterReferences() {
  return (await getAppPreferences()).characterReferences;
}

export async function addCharacterReference(buffer: Buffer) {
  const existing = await listCharacterReferences();
  if (existing.length >= MAX_CHARACTER_REFERENCES) throw new Error(`Keep at most ${MAX_CHARACTER_REFERENCES} character reference images.`);
  const metadata = await validateImageBuffer(buffer);
  const reference = characterReferenceSchema.parse({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...metadata });
  await fs.mkdir(characterReferenceRoot, { recursive: true });
  await fs.writeFile(characterReferencePath(reference), buffer, { flag: "wx" });
  await setAppPreferences({ characterReferences: [...existing, reference] });
  return reference;
}

export async function removeCharacterReference(id: string) {
  const existing = await listCharacterReferences();
  const reference = existing.find((candidate) => candidate.id === id);
  if (!reference) throw new Error("Character reference image was not found.");
  await setAppPreferences({ characterReferences: existing.filter((candidate) => candidate.id !== id) });
  await fs.rm(characterReferencePath(reference), { force: true });
  return existing.filter((candidate) => candidate.id !== id);
}

/** Absolute paths for the selected references, in the order they were saved. */
export async function resolveCharacterReferencePaths(ids: string[]) {
  if (!ids.length) return [];
  const references = await listCharacterReferences();
  return ids.map((id) => {
    const reference = references.find((candidate) => candidate.id === id);
    if (!reference) throw new Error("A character reference image could not be found.");
    return assertPathInsideRoot(characterReferencePath(reference), characterReferenceRoot);
  });
}
