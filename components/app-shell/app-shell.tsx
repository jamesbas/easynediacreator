"use client";

import { Clapperboard, Images, ListChecks, Paintbrush, Settings, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navigation = [
  { href: "/create-image", label: "Create", longLabel: "Create Image", icon: Sparkles },
  { href: "/edit-image", label: "Edit", longLabel: "Edit Image", icon: Paintbrush },
  { href: "/create-video", label: "Video", longLabel: "Create Video", icon: Clapperboard },
  { href: "/outputs", label: "Outputs", longLabel: "Outputs", icon: Images },
  { href: "/jobs", label: "Jobs", longLabel: "Jobs", icon: ListChecks },
  { href: "/settings", label: "Settings", longLabel: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/login") return children;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-[var(--line)] bg-[var(--surface)] lg:flex lg:flex-col">
        <Link href="/create-image" className="border-b border-[var(--line)] px-6 py-7">
          <span className="block text-[0.68rem] font-semibold uppercase text-[var(--accent)]">Private WanGP Studio</span>
          <span className="mt-1 block text-xl font-bold">Easy Media Generator</span>
        </Link>
        <nav aria-label="Main navigation" className="flex-1 p-3">
          {navigation.map(({ href, longLabel, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`mb-1 flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors ${active ? "bg-[var(--foreground)] text-white" : "text-[var(--muted)] hover:bg-[#ebe8df] hover:text-[var(--foreground)]"}`}>
                <Icon aria-hidden="true" size={18} strokeWidth={2} />
                {longLabel}
              </Link>
            );
          })}
        </nav>
        <p className="border-t border-[var(--line)] px-5 py-4 text-xs leading-5 text-[var(--muted)]">Powered by WanGP by DeepBeepMeep.</p>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-14 items-center border-b border-[var(--line)] bg-[color:rgba(255,253,248,0.94)] px-4 backdrop-blur lg:hidden">
          <Link href="/create-image" className="font-bold">Easy Media Generator</Link>
          <span className="ml-auto rounded-sm bg-[#dcece8] px-2 py-1 font-mono text-[0.65rem] font-semibold text-[var(--teal)]">TAILNET</span>
        </header>
        <main className="mx-auto min-h-[calc(100vh-5rem)] w-full max-w-6xl px-4 py-6 pb-28 sm:px-7 sm:py-9 lg:px-10 lg:pb-12">{children}</main>
      </div>

      <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 grid h-20 grid-cols-6 border-t border-[var(--line)] bg-[var(--surface)] px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 text-[0.62rem] font-semibold ${active ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
              <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="w-full truncate px-0.5 text-center">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}