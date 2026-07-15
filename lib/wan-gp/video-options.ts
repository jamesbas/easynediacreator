export const videoDurationOptions = Array.from({ length: 20 }, (_, index) => index + 1);
export const defaultVideoDuration = 15;

export function getDefaultVideoDuration(defaults: Record<string, unknown>) {
  void defaults;
  return defaultVideoDuration;
}