import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** Native disclosure so the page stays a server component and keeps working without JavaScript. */
export function CollapsibleSection({ title, description, meta, defaultOpen = false, bodyClassName = "p-4 sm:p-5", children }: { title: string; description?: string; meta?: ReactNode; defaultOpen?: boolean; bodyClassName?: string; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group mt-8 border border-[var(--line)] bg-[var(--surface)]">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 marker:content-none hover:bg-[#f2f0e9] sm:p-5 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-90" />
        <h2 className="text-lg font-bold">{title}</h2>
        {meta && <span className="ml-auto font-mono text-xs text-[var(--muted)]">{meta}</span>}
      </summary>
      <div className={`border-t border-[var(--line)] ${bodyClassName}`}>
        {description && <p className="mb-4 text-sm leading-6 text-[var(--muted)]">{description}</p>}
        {children}
      </div>
    </details>
  );
}
