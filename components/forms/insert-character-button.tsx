"use client";

import { UserRoundPlus } from "lucide-react";
import { useState, type RefObject } from "react";
import { insertCharacterPrompt, type CharacterSummary } from "@/lib/character-prompt";

/**
 * Drops a saved character description into the prompt at the caret, or appends it
 * when the field is unfocused. With more than one described character the button
 * opens a menu so a prompt can be built from several of them.
 */
export function InsertCharacterButton({ characters, prompt, textarea, disabled, onInsert, onOverflow }: { characters: CharacterSummary[]; prompt: string; textarea: RefObject<HTMLTextAreaElement | null>; disabled?: boolean; onInsert: (value: string) => void; onOverflow: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const described = characters.filter((character) => character.prompt.trim());
  const className = "inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-xs font-bold hover:border-[var(--teal)] disabled:opacity-50";

  const insert = (characterPrompt: string) => {
    const element = textarea.current;
    const inserted = insertCharacterPrompt(prompt, characterPrompt, element?.selectionStart, element?.selectionEnd);
    if (inserted.value.length > 4000) { onOverflow("The character prompt would exceed the 4,000-character prompt limit."); return; }
    onInsert(inserted.value);
    requestAnimationFrame(() => { element?.focus(); element?.setSelectionRange(inserted.cursor, inserted.cursor); });
  };

  if (described.length < 2) return <button type="button" disabled={disabled || !described.length} onClick={() => insert(described[0].prompt)} className={className}><UserRoundPlus size={16} />Insert character</button>;

  return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={className}><UserRoundPlus size={16} />Insert character</button>
    {open && <ul role="menu" className="absolute right-0 z-20 mt-1 max-h-64 min-w-52 overflow-y-auto border border-[var(--line)] bg-white py-1 shadow-lg">
      {described.map((character) => <li key={character.id}>
        <button type="button" role="menuitem" onClick={() => { insert(character.prompt); setOpen(false); }} className="block w-full truncate px-3 py-2 text-left text-xs font-bold hover:bg-[#f6f4ee]">{character.name}</button>
      </li>)}
    </ul>}
  </div>;
}
