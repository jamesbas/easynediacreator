import type { GenerationChoice } from "./generation-controls";

export const LTX2_1080P_CHOICES: GenerationChoice[] = [
  { label: "1920x1088 (16:9)", value: "1920x1088" },
  { label: "1088x1920 (9:16)", value: "1088x1920" },
  { label: "1408x1408 (1:1)", value: "1408x1408" },
  { label: "1536x1024 (3:2)", value: "1536x1024" },
  { label: "1024x1536 (2:3)", value: "1024x1536" },
  { label: "1920x832 (21:9)", value: "1920x832" },
  { label: "832x1920 (9:21)", value: "832x1920" },
  { label: "2048x768 (8:3)", value: "2048x768" },
  { label: "1024x1792 (4:7)", value: "1024x1792" },
  { label: "1088x1088 (1:1)", value: "1088x1088" },
];

export function getVideoFallbackResolutions(modelKey: string, defaultResolution: string): GenerationChoice[] {
  if (modelKey !== "ltx-2") return [];
  const choices = LTX2_1080P_CHOICES.map((choice) => ({ ...choice }));
  if (choices.some((choice) => choice.value === defaultResolution)) return choices;
  return [{ label: `${defaultResolution} (current default)`, value: defaultResolution }, ...choices];
}