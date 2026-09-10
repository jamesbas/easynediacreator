"use client";

import { Undo2, WandSparkles } from "lucide-react";
import { useState } from "react";
import type { WorkflowType } from "@/lib/types";

export type EnhanceContext = {
  workflowType: WorkflowType;
  modelKey: string;
  durationSeconds?: number;
  hasStartFrame?: boolean;
  hasEndFrame?: boolean;
  hasSourceImage?: boolean;
  referenceCount?: number;
};

/** Handles for the pictures the render will get, resolved server-side. */
export type EnhanceImageSelection = {
  startUploadId?: string;
  startAssetId?: string;
  endUploadId?: string;
  endAssetId?: string;
  sourceUploadId?: string;
  sourceAssetId?: string;
  referenceUploadIds?: string[];
  referenceAssetIds?: string[];
  characterReferenceIds?: string[];
};

/**
 * Rewrites the prompt through the language model running in LM Studio, in the
 * terms of the checkpoint that will render it.
 *
 * The rewrite replaces the prompt in place because that is what gets submitted,
 * and the original is kept so one click puts it back — a rewrite is a
 * suggestion, and an enhancement you cannot undo is a prompt you have lost.
 *
 * `prepareImages` belongs to the form because only the form knows which of its
 * pictures are still unsent files; it uploads those and returns the handles.
 */
export function EnhancePromptButton({ enabled, prompt, context, prepareImages, disabled, onChange, onError }: { enabled: boolean; prompt: string; context: EnhanceContext; prepareImages?: () => Promise<EnhanceImageSelection>; disabled?: boolean; onChange: (value: string) => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [original, setOriginal] = useState<string>();
  const className = "inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-xs font-bold hover:border-[var(--teal)] disabled:opacity-50";

  if (!enabled) return null;

  async function enhance() {
    const before = prompt;
    setBusy(true);
    onError("");
    try {
      // A picture that will not upload is not worth losing the rewrite over.
      const images = await prepareImages?.().catch(() => ({})) ?? {};
      const response = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...context, ...images, prompt: before }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The prompt could not be enhanced.");
      setOriginal(before);
      onChange(result.prompt as string);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "The prompt could not be enhanced.");
    } finally {
      setBusy(false);
    }
  }

  return <span className="inline-flex items-center gap-2">
    {original !== undefined && <button type="button" disabled={busy} onClick={() => { onChange(original); setOriginal(undefined); onError(""); }} className={className}><Undo2 size={16} />Undo</button>}
    <button type="button" disabled={disabled || busy || !prompt.trim() || !context.modelKey} onClick={enhance} className={className} aria-busy={busy}><WandSparkles size={16} />{busy ? "Enhancing..." : "Enhance prompt"}</button>
  </span>;
}
