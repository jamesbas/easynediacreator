export const videoDurationOptions = Array.from({ length: 20 }, (_, index) => index + 1);

export function getDefaultVideoDuration(defaults: Record<string, unknown>) {
  const explicit = typeof defaults.duration_seconds === "number" ? defaults.duration_seconds : typeof defaults.durationSeconds === "number" ? defaults.durationSeconds : undefined;
  const parsedFps = Number(defaults.force_fps ?? defaults.fps ?? defaults.frame_rate);
  const fps = Number.isFinite(parsedFps) && parsedFps > 0 ? parsedFps : 24;
  const frames = typeof defaults.video_length === "number" ? defaults.video_length : typeof defaults.num_frames === "number" ? defaults.num_frames : undefined;
  const duration = explicit ?? (frames ? (frames - 1) / fps : 5);
  return Math.max(1, Math.min(20, Math.round(duration)));
}