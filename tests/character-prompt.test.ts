import { describe, expect, it } from "vitest";
import { DEFAULT_CHARACTER_PROMPT, insertCharacterPrompt } from "@/lib/character-prompt";
import { appPreferencesSchema } from "@/lib/runtime/app-preferences";

describe("character prompt preference", () => {
  it("uses the configured default and enforces the generation prompt limit", () => {
    expect(appPreferencesSchema.parse({}).characterPrompt).toBe(DEFAULT_CHARACTER_PROMPT);
    expect(() => appPreferencesSchema.parse({ characterPrompt: "x".repeat(4001) })).toThrow(/4,000/);
  });

  it("inserts at the cursor without destroying existing prompt text", () => {
    expect(insertCharacterPrompt("", "Character")).toEqual({ value: "Character", cursor: 9 });
    expect(insertCharacterPrompt("At the beach", "Character")).toEqual({ value: "At the beach Character", cursor: 22 });
    expect(insertCharacterPrompt("A person at sunset", "Character", 2, 8)).toEqual({ value: "A Character at sunset", cursor: 11 });
  });
});