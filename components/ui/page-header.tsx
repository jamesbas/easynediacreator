import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 font-mono text-xs font-semibold uppercase text-[var(--accent)]">{eyebrow}</p>
        <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">{description}</p>
      </div>
      {action}
    </header>
  );
}