import type { LucideIcon } from "lucide-react";

export function PlaceholderPanel({ icon: Icon, title, message }: { icon: LucideIcon; title: string; message: string }) {
  return (
    <section className="border border-dashed border-[#aeb5ac] bg-[var(--surface)] px-6 py-16 text-center">
      <Icon className="mx-auto mb-4 text-[var(--teal)]" size={32} aria-hidden="true" />
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">{message}</p>
    </section>
  );
}