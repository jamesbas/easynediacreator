import { describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER_NAME, DEFAULT_CHARACTER_PROMPT, insertCharacterPrompt, LEGACY_CHARACTER_ID } from "@/lib/character-prompt";
import { appPreferencesSchema } from "@/lib/runtime/app-preferences";

describe("character prompt preference", () => {
  it("seeds a default character and enforces the generation prompt limit", () => {
    expect(appPreferencesSchema.parse({}).characters).toEqual([expect.objectContaining({ id: LEGACY_CHARACTER_ID, name: DEFAULT_CHARACTER_NAME, prompt: DEFAULT_CHARACTER_PROMPT, references: [] })]);
    expect(() => appPreferencesSchema.parse({ characters: [{ id: LEGACY_CHARACTER_ID, name: "Ada", prompt: "x".repeat(4001), createdAt: "" }] })).toThrow(/4,000/);
  });

  it("folds the pre-library characterPrompt and characterReferences into the first character", () => {
    const reference = { id: "00000000-0000-4000-8000-0000000000aa", extension: "png", mime: "image/png", width: 4, height: 4, createdAt: "" };
    const preferences = appPreferencesSchema.parse({ characterPrompt: "A weathered lighthouse keeper.", characterReferences: [reference] });
    expect(preferences.characters).toHaveLength(1);
    expect(preferences.characters[0]).toMatchObject({ id: LEGACY_CHARACTER_ID, name: DEFAULT_CHARACTER_NAME, prompt: "A weathered lighthouse keeper." });
    expect(preferences.characters[0].references).toEqual([reference]);
  });

  it("inserts at the cursor without destroying existing prompt text", () => {
    expect(insertCharacterPrompt("", "Character")).toEqual({ value: "Character", cursor: 9 });
    expect(insertCharacterPrompt("At the beach", "Character")).toEqual({ value: "At the beach Character", cursor: 22 });
    expect(insertCharacterPrompt("A person at sunset", "Character", 2, 8)).toEqual({ value: "A Character at sunset", cursor: 11 });
  });
});