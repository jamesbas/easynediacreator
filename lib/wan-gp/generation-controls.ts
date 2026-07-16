export type GenerationChoice = { label: string; value: string };
export type NumericConstraint = { min: number; max: number; step: number; defaultValue: number };
export type GenerationControls = {
  resolutions: GenerationChoice[];
  defaultResolution: string;
  steps: NumericConstraint;
  guidance?: NumericConstraint;
  solvers: GenerationChoice[];
  defaultSolver?: string;
  schedulerKey?: "scheduler" | "scheduler_type" | "scheduler_name";
  schedulers: GenerationChoice[];
  defaultScheduler?: string;
  duration?: NumericConstraint;
  fps?: NumericConstraint;
};

type ControlOptions = {
  workflow: "image" | "video";
  fallbackResolutions: Array<string | GenerationChoice>;
  fallbackResolution: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function finite(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function settingValues(schema: Record<string, unknown>) {
  const metadata = record(schema.metadata);
  return [record(schema.setting_values), record(metadata?.setting_values)].filter((value): value is Record<string, unknown> => Boolean(value));
}

function modelDefinition(schema: Record<string, unknown>) {
  return record(schema.model_def) ?? {};
}

function settingDefinition(schema: Record<string, unknown>, key: string) {
  for (const values of settingValues(schema)) if (values[key] !== undefined) return values[key];
  for (const containerName of ["properties", "settings"]) {
    const container = record(schema[containerName]);
    if (container?.[key] !== undefined) return container[key];
  }
  if (Array.isArray(schema.fields)) {
    const field = schema.fields.find((candidate) => {
      const item = record(candidate);
      return item?.name === key || item?.key === key || item?.id === key;
    });
    if (field !== undefined) return field;
  }
}

function normalizeChoices(value: unknown): GenerationChoice[] {
  const container = record(value);
  const source = container ? container.choices ?? container.options ?? container.values ?? container.enum ?? value : value;
  if (!Array.isArray(source)) return [];
  const choices = source.flatMap((entry): GenerationChoice[] => {
    if (typeof entry === "string" || typeof entry === "number") return [{ label: String(entry), value: String(entry) }];
    if (Array.isArray(entry) && entry.length >= 2) return [{ label: String(entry[0]), value: String(entry[1]) }];
    const item = record(entry);
    if (!item) return [];
    const choiceValue = item.value ?? item.id ?? item.key ?? item.name;
    if (typeof choiceValue !== "string" && typeof choiceValue !== "number") return [];
    return [{ label: String(item.label ?? item.name ?? choiceValue), value: String(choiceValue) }];
  });
  return [...new Map(choices.filter((choice) => choice.value.length > 0).map((choice) => [choice.value, choice])).values()];
}

function choicesFor(schema: Record<string, unknown>, key: string, modelKeys: string[] = []) {
  const sources = [settingDefinition(schema, key), ...modelKeys.map((modelKey) => modelDefinition(schema)[modelKey]), ...modelKeys.map((modelKey) => schema[modelKey])];
  for (const source of sources) {
    const choices = normalizeChoices(source);
    if (choices.length) return choices;
  }
  return [];
}

function numericSources(schema: Record<string, unknown>, keys: string[], modelKeys: string[] = []) {
  return [
    ...keys.map((key) => settingDefinition(schema, key)),
    ...modelKeys.map((key) => modelDefinition(schema)[key]),
    ...modelKeys.map((key) => schema[key]),
  ].map(record).filter((value): value is Record<string, unknown> => Boolean(value));
}

function firstNumber(sources: Record<string, unknown>[], keys: string[]) {
  for (const source of sources) for (const key of keys) {
    const value = finite(source[key]);
    if (value !== undefined) return value;
  }
}

function numericConstraint(schema: Record<string, unknown>, defaults: Record<string, unknown>, keys: string[], fallback: NumericConstraint, modelKeys: string[] = []) {
  const sources = numericSources(schema, keys, modelKeys);
  const min = firstNumber(sources, ["min", "minimum"]) ?? fallback.min;
  const max = firstNumber(sources, ["max", "maximum"]) ?? fallback.max;
  const step = firstNumber(sources, ["step", "increment", "inc"]) ?? fallback.step;
  const configuredDefault = keys.map((key) => finite(defaults[key])).find((value) => value !== undefined);
  const describedDefault = firstNumber(sources, ["default", "defaultValue", "value"]);
  const defaultValue = Math.min(max, Math.max(min, configuredDefault ?? describedDefault ?? fallback.defaultValue));
  return { min, max, step: step > 0 ? step : fallback.step, defaultValue };
}

function hasSetting(schema: Record<string, unknown>, defaults: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => defaults[key] !== undefined || settingDefinition(schema, key) !== undefined || modelDefinition(schema)[key] !== undefined);
}

export function getGenerationControls(schema: Record<string, unknown>, defaults: Record<string, unknown>, options: ControlOptions): GenerationControls {
  const discoveredResolutions = choicesFor(schema, "resolution", ["resolutions"]);
  const fallbackResolutions = normalizeChoices(options.fallbackResolutions.length ? options.fallbackResolutions : [options.fallbackResolution]);
  const resolutions = discoveredResolutions.length ? discoveredResolutions : fallbackResolutions;
  const configuredResolution = typeof defaults.resolution === "string" ? defaults.resolution : options.fallbackResolution;
  const defaultResolution = resolutions.some((choice) => choice.value === configuredResolution) ? configuredResolution : resolutions[0]?.value ?? options.fallbackResolution;
  const steps = numericConstraint(schema, defaults, ["num_inference_steps", "steps"], { min: 1, max: 200, step: 1, defaultValue: options.workflow === "video" ? 8 : 20 }, ["steps_slider", "inference_steps_slider"]);
  const guidanceKeys = ["guidance_scale", "cfg_scale"];
  const guidance = options.workflow === "image" || hasSetting(schema, defaults, guidanceKeys)
    ? numericConstraint(schema, defaults, guidanceKeys, { min: 0, max: 30, step: 0.1, defaultValue: 1 }, ["guidance_slider", "guidance_scale_slider"])
    : undefined;
  const solvers = choicesFor(schema, "sample_solver", ["sample_solvers"]);
  const defaultSolver = typeof defaults.sample_solver === "string" && solvers.some((choice) => choice.value === defaults.sample_solver) ? defaults.sample_solver : undefined;
  const schedulerKey = (["scheduler", "scheduler_type", "scheduler_name"] as const).find((key) => hasSetting(schema, defaults, [key]) && choicesFor(schema, key, [`${key}s`]).length > 0);
  const schedulers = schedulerKey ? choicesFor(schema, schedulerKey, [`${schedulerKey}s`]) : [];
  const defaultScheduler = schedulerKey && typeof defaults[schedulerKey] === "string" && schedulers.some((choice) => choice.value === defaults[schedulerKey]) ? defaults[schedulerKey] as string : undefined;
  const controls: GenerationControls = { resolutions, defaultResolution, steps, guidance, solvers, defaultSolver, schedulerKey, schedulers, defaultScheduler };
  if (options.workflow === "video") {
    controls.duration = numericConstraint(schema, {}, ["duration_seconds"], { min: 1, max: 20, step: 1, defaultValue: 15 }, ["duration_slider"]);
    controls.fps = numericConstraint(schema, defaults, ["force_fps", "fps", "frame_rate"], { min: 1, max: 120, step: 1, defaultValue: 24 }, ["fps_slider"]);
  }
  return controls;
}

function validateNumber(label: string, value: number | undefined, constraint: NumericConstraint | undefined) {
  if (value === undefined || !constraint) return;
  if (value < constraint.min || value > constraint.max) throw new Error(`${label} must be between ${constraint.min} and ${constraint.max} for the selected model.`);
  const steps = (value - constraint.min) / constraint.step;
  if (Math.abs(steps - Math.round(steps)) > 1e-7) throw new Error(`${label} must use increments of ${constraint.step} for the selected model.`);
}

export function validateGenerationControls(values: { resolution?: string; steps?: number; guidanceScale?: number; sampleSolver?: string; scheduler?: string; durationSeconds?: number; fps?: number }, controls: GenerationControls) {
  if (values.resolution && controls.resolutions.length && !controls.resolutions.some((choice) => choice.value === values.resolution)) throw new Error("Resolution is not supported by the selected model.");
  validateNumber("Steps", values.steps, controls.steps);
  validateNumber("Guidance", values.guidanceScale, controls.guidance);
  validateNumber("Duration", values.durationSeconds, controls.duration);
  validateNumber("FPS", values.fps, controls.fps);
  if (values.sampleSolver && !controls.solvers.some((choice) => choice.value === values.sampleSolver)) throw new Error("Solver is not supported by the selected model.");
  if (values.scheduler && !controls.schedulers.some((choice) => choice.value === values.scheduler)) throw new Error("Scheduler is not supported by the selected model.");
}