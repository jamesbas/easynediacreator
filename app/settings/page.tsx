import { CheckCircle2, CircleAlert, CircleX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { RefreshModelsButton } from "@/components/settings/refresh-models-button";
import { ModelSelectionControl } from "@/components/settings/model-selection-control";
import { DefaultLoraSetting } from "@/components/settings/default-lora-setting";
import { CharacterLibrary } from "@/components/settings/character-library";
import { config } from "@/lib/config";
import { characterSummaries, getAppPreferences } from "@/lib/runtime/app-preferences";
import { getModels } from "@/lib/runtime/model-cache";
import { isPromptEnhancerConfigured } from "@/lib/prompt-enhancer/lm-studio";
import { getWanGpClient } from "@/lib/wan-gp";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const preferences = await getAppPreferences();
  let connected = false;
  let version: string | undefined;
  let models = [] as Awaited<ReturnType<typeof getModels>>;
  try {
    const status = await getWanGpClient().ping();
    connected = status.connected;
    version = status.version;
    models = await getModels();
  } catch {}

  return (
    <>
      <PageHeader eyebrow="System" title="Settings" description="Review WanGP connectivity, approved models, and safe local defaults." action={<RefreshModelsButton />} />
      <CollapsibleSection title="System status" meta={connected ? "Connected" : "Offline"} bodyClassName="grid gap-px bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
        <StatusCell label="WanGP MCP" value={connected ? "Connected" : "Offline"} tone={connected ? "good" : "bad"} />
        <StatusCell label="WanGP version" value={version ?? "Unavailable"} />
        <StatusCell label="Client mode" value={config.WANGP_CLIENT_MODE === "fake" ? "Development fixture" : "Local WanGP"} />
        <StatusCell label="GPU concurrency" value={`${config.MAX_ACTIVE_GENERATION_JOBS} active`} />
        <StatusCell label="Prompt enhancer" value={isPromptEnhancerConfigured() ? config.LM_STUDIO_MODEL || "Loaded LM Studio model" : "Not configured"} tone={isPromptEnhancerConfigured() ? "good" : undefined} />
        <StatusCell label="LM Studio" value={config.LM_STUDIO_BASE_URL ?? "Set LM_STUDIO_BASE_URL"} />
      </CollapsibleSection>
      <CollapsibleSection title="Characters" meta={`${preferences.characters.length} saved`} description="Save a prompt and reference photographs for each recurring character, then pull them into any generation by name.">
        <CharacterLibrary initialCharacters={characterSummaries(preferences.characters)} />
      </CollapsibleSection>
      <CollapsibleSection title="Approved models" meta={`${models.length} workflow mappings`} bodyClassName="divide-y divide-[var(--line)]">
        {models.length ? models.map((model) => <ModelRow key={`${model.workflowType}-${model.key}`} model={model} defaultLoras={preferences.defaultLoras[`${model.workflowType}:${model.key}`] ?? []} />) : <p className="p-5 text-sm text-[var(--muted)]">Model discovery is unavailable. Confirm that WanGP MCP is running locally.</p>}
      </CollapsibleSection>
      <section className="mt-8 border-l-4 border-[var(--teal)] bg-[#e6f1ee] p-5"><h2 className="font-bold">Local processing</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Powered by WanGP by DeepBeepMeep. Prompts and media are processed by your locally hosted WanGP installation and outputs remain in its configured local folder.</p></section>
    </>
  );
}

function StatusCell({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="bg-[var(--surface)] p-5"><p className="font-mono text-[0.68rem] uppercase text-[var(--muted)]">{label}</p><p className={`mt-2 font-bold ${tone === "good" ? "text-[var(--teal)]" : tone === "bad" ? "text-[var(--accent)]" : ""}`}>{value}</p></div>;
}

function ModelRow({ model, defaultLoras }: { model: Awaited<ReturnType<typeof getModels>>[number]; defaultLoras: { name: string; strength: number }[] }) {
  const Icon = model.availability === "available" ? CheckCircle2 : model.availability === "partial" ? CircleAlert : CircleX;
  const color = model.availability === "available" ? "text-[var(--teal)]" : model.availability === "partial" ? "text-[#9b7100]" : "text-[var(--accent)]";
  return <div className="flex items-start gap-4 p-4"><Icon aria-hidden="true" className={`mt-0.5 shrink-0 ${color}`} size={20} /><div className="min-w-0 flex-1"><p className="font-bold">{model.displayName}</p><p className="mt-1 font-mono text-[0.68rem] text-[var(--muted)]">{model.modelType ?? "No model selected"}</p><p className="mt-1 text-xs text-[var(--muted)]">{model.workflowType.replaceAll("-", " ")}{model.reason ? `: ${model.reason}` : ""}</p>{model.candidates.length > 0 && <ModelSelectionControl selectionKey={`${model.workflowType}:${model.key}`} modelType={model.modelType} candidates={model.candidates} />}<DefaultLoraSetting selectionKey={`${model.workflowType}:${model.key}`} catalog={model.loraCatalog} initialLoras={defaultLoras} /></div><span className={`font-mono text-[0.68rem] uppercase ${color}`}>{model.availability}</span></div>;
}