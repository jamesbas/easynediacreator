"use client";

import { useState } from "react";
import type { ModelAvailability, WorkflowType } from "@/lib/types";

type VisibilityModel = {
  workflowType: WorkflowType;
  modelType?: string;
  displayName: string;
  availability: ModelAvailability;
  visible: boolean;
};

const workflows: Array<{ type: WorkflowType; label: string }> = [
  { type: "image-create", label: "Create Image" },
  { type: "image-edit", label: "Edit Image" },
  { type: "video-create", label: "Create Video" },
];

export function ModelVisibilityControl({ models }: { models: VisibilityModel[] }) {
  const [visible, setVisible] = useState(() => new Set(models.filter((model) => model.visible && model.modelType).map((model) => `${model.workflowType}:${model.modelType}`)));
  const [saving, setSaving] = useState<WorkflowType>();
  const [error, setError] = useState("");

  async function toggle(workflowType: WorkflowType, modelType: string, checked: boolean) {
    const previous = new Set(visible);
    const next = new Set(visible);
    const key = `${workflowType}:${modelType}`;
    if (checked) next.add(key); else next.delete(key);
    setVisible(next);
    setSaving(workflowType);
    setError("");
    const visibleModelTypes = models
      .filter((model) => model.workflowType === workflowType && model.modelType && next.has(`${workflowType}:${model.modelType}`))
      .map((model) => model.modelType as string);
    const response = await fetch("/api/settings/model-visibility", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowType, visibleModelTypes }),
    });
    const result = await response.json();
    setSaving(undefined);
    if (!response.ok) {
      setVisible(previous);
      setError(result.error ?? "Dropdown model visibility could not be saved.");
    }
  }

  return <div className="grid gap-px bg-[var(--line)] lg:grid-cols-3">
    {workflows.map(({ type, label }) => {
      const workflowModels = models.filter((model) => model.workflowType === type && model.modelType);
      return <fieldset key={type} disabled={Boolean(saving)} className="bg-[var(--surface)] p-5 disabled:opacity-60">
        <legend className="font-bold">{label}</legend>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Choose the available WanGP checkpoints shown in this tab.</p>
        <div className="mt-4 space-y-3">
          {workflowModels.map((model) => {
            const modelType = model.modelType as string;
            const available = model.availability === "available";
            return <label key={modelType} className={`flex items-start gap-3 text-sm ${available ? "cursor-pointer" : "cursor-not-allowed opacity-55"}`}>
              <input type="checkbox" checked={visible.has(`${type}:${modelType}`)} disabled={!available} onChange={(event) => toggle(type, modelType, event.target.checked)} className="mt-0.5 size-4 accent-[var(--teal)]" />
              <span><strong className="block">{model.displayName}</strong><span className="font-mono text-[0.66rem] text-[var(--muted)]">{modelType}{available ? "" : ` (${model.availability})`}</span></span>
            </label>;
          })}
          {!workflowModels.length && <p className="text-sm text-[var(--muted)]">No compatible models discovered.</p>}
        </div>
      </fieldset>;
    })}
    {saving && <p role="status" className="bg-[var(--surface)] p-4 text-sm text-[var(--muted)] lg:col-span-3">Saving dropdown models...</p>}
    {error && <p role="alert" className="bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--accent)] lg:col-span-3">{error}</p>}
  </div>;
}
