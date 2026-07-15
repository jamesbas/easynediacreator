export const DEFAULT_CHARACTER_PROMPT = "The Woman is in her late 40s or early 50s, with subtle laugh lines around her mouth and eyes. She has fair skin with a natural flush, dotted with faint freckles or age spots across her cheeks, nose, and décolletage, adding to her mature, sun-kissed charm. Her eyes are a striking blue, her eyebrows gently arched. Her hair is a soft, honey-blonde with lighter highlights, falling in loose, wavy strands past her shoulders, framing her face casually. Her body build looks natural and curvy, perhaps a little over weight (5 foot and 4 inches tall; weighing 130 lbs), somewhat wider hips with think thighs, with slightly flabby but muscular arms and b-cup breasts with natural sag for age. Her nails are neatly manicured, short and natural, with a subtle ring on one finger.";

export function insertCharacterPrompt(current: string, characterPrompt: string, selectionStart = current.length, selectionEnd = selectionStart) {
  const insertion = characterPrompt.trim();
  const start = Math.max(0, Math.min(selectionStart, current.length));
  const end = Math.max(start, Math.min(selectionEnd, current.length));
  const before = current.slice(0, start);
  const after = current.slice(end);
  const prefix = before && !/\s$/.test(before) ? " " : "";
  const suffix = after && !/^\s/.test(after) ? " " : "";
  return { value: `${before}${prefix}${insertion}${suffix}${after}`, cursor: before.length + prefix.length + insertion.length };
}