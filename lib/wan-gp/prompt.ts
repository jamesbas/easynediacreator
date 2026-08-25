export function normalizeWanGpPrompt(prompt: string) {
  return prompt.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

export function normalizeWanGpPromptSettings(settings: Record<string, unknown>) {
  const normalized = { ...settings };
  for (const key of ["prompt", "text_prompt", "instruction"]) {
    if (typeof normalized[key] === "string") normalized[key] = normalizeWanGpPrompt(normalized[key]);
  }
  return normalized;
}