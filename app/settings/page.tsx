import { CheckCircle2, CircleAlert, CircleX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshModelsButton } from "@/components/settings/refresh-models-button";
import { config } from "@/lib/config";
import { getModels } from "@/lib/runtime/model-cache";
import { getWanGpClient } from "@/lib/wan-gp";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
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
      <section className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
        <StatusCell label="WanGP MCP" value={connected ? "Connected" : "Offline"} tone={connected ? "good" : "bad"} />
        <StatusCell label="WanGP version" value={version ?? "Unavailable"} />
        <StatusCell label="Client mode" value={config.WANGP_CLIENT_MODE === "fake" ? "Development fixture" : "Local WanGP"} />
        <StatusCell label="GPU concurrency" value={`${config.MAX_ACTIVE_GENERATION_JOBS} active`} />
      </section>
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Approved models</h2><span className="font-mono text-xs text-[var(--muted)]">{models.length} workflow mappings</span></div>
        <div className="divide-y divide-[var(--line)] border border-[var(--line)] bg-[var(--surface)]">
          {models.length ? models.map((model) => <ModelRow key={`${model.workflowType}-${model.key}`} model={model} />) : <p className="p-5 text-sm text-[var(--muted)]">Model discovery is unavailable. Confirm that WanGP MCP is running locally.</p>}
        </div>
      </section>
      <section className="mt-8 border-l-4 border-[var(--teal)] bg-[#e6f1ee] p-5"><h2 className="font-bold">Local processing</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">Powered by WanGP by DeepBeepMeep. Prompts and media are processed by your locally hosted WanGP installation and outputs remain in its configured local folder.</p></section>
    </>
  );
}

function StatusCell({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return <div className="bg-[var(--surface)] p-5"><p className="font-mono text-[0.68rem] uppercase text-[var(--muted)]">{label}</p><p className={`mt-2 font-bold ${tone === "good" ? "text-[var(--teal)]" : tone === "bad" ? "text-[var(--accent)]" : ""}`}>{value}</p></div>;
}

function ModelRow({ model }: { model: Awaited<ReturnType<typeof getModels>>[number] }) {
  const Icon = model.availability === "available" ? CheckCircle2 : model.availability === "partial" ? CircleAlert : CircleX;
  const color = model.availability === "available" ? "text-[var(--teal)]" : model.availability === "partial" ? "text-[#9b7100]" : "text-[var(--accent)]";
  return <div className="flex items-start gap-4 p-4 sm:items-center"><Icon aria-hidden="true" className={`mt-0.5 shrink-0 sm:mt-0 ${color}`} size={20} /><div className="min-w-0 flex-1"><p className="font-bold">{model.displayName}</p><p className="text-xs text-[var(--muted)]">{model.workflowType.replaceAll("-", " ")}{model.reason ? `: ${model.reason}` : ""}</p></div><span className={`font-mono text-[0.68rem] uppercase ${color}`}>{model.availability}</span></div>;
}