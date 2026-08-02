"use client";

import { UserRoundPlus } from "lucide-react";
import type { RefObject } from "react";
import { insertCharacterPrompt } from "@/lib/character-prompt";

/** Drops the saved character description into the prompt at the caret, or appends it when the field is unfocused. */
export function InsertCharacterButton({ characterPrompt, prompt, textarea, disabled, onInsert, onOverflow }: { characterPrompt: string; prompt: string; textarea: RefObject<HTMLTextAreaElement | null>; disabled?: boolean; onInsert: (value: string) => void; onOverflow: (message: string) => void }) {
  return <button type="button" disabled={disabled || !characterPrompt.trim()} onClick={() => {
    const element = textarea.current;
    const inserted = insertCharacterPrompt(prompt, characterPrompt, element?.selectionStart, element?.selectionEnd);
    if (inserted.value.length > 4000) { onOverflow("The character prompt would exceed the 4,000-character prompt limit."); return; }
    onInsert(inserted.value);
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(inserted.cursor, inserted.cursor); });
  }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-xs font-bold hover:border-[var(--teal)] disabled:opacity-50"><UserRoundPlus size={16} />Insert character</button>;
}
