"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Plus } from "lucide-react";
import { AREAS, NAV_GROUPS } from "@/lib/areas";
import { TONE_SOFT, TONE_TEXT } from "@/lib/tones";

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex shrink-0 flex-col gap-1 border-line bg-surface px-4 py-6 md:sticky md:top-0 md:h-screen md:w-60 md:overflow-y-auto md:border-r"
    >
      <div className="flex items-center gap-2.5 px-3 pb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        </div>
        <span className="text-[15px] font-bold tracking-wide">
          SCREEN-BOX <span className="font-medium text-muted">CRM</span>
        </span>
      </div>

      {NAV_GROUPS.map((group, i) => (
        <div key={group.title ?? i} className="flex flex-col gap-0.5 pt-3 first-of-type:pt-0">
          {group.title && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.title}</p>
          )}
          {group.areas.map((key) => {
            const { href, label, icon: Icon, tone } = AREAS[key];
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            // Aktiver Punkt: zarter Hintergrund in Bereichsfarbe, neutrale Bereiche wie bisher grau
            const activeBg = tone === "neutral" ? "bg-bg" : TONE_SOFT[tone].split(" ")[0];
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-sm ${
                  active ? `${activeBg} font-semibold text-ink` : "font-medium text-muted hover:text-ink"
                }`}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" className={tone === "neutral" && active ? "text-ink" : TONE_TEXT[tone]} />
                {label}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="min-h-6 flex-1" />

      <Link
        href="/vorgaenge/neu?schnell=1"
        className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent text-sm font-semibold text-white hover:opacity-90"
      >
        <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
        Schnellauftrag
      </Link>

      <form action="/api/auth/logout" method="post" className="mt-4 flex items-center gap-2 px-3">
        <span className="flex-1 truncate text-xs text-muted">{userName}</span>
        <button
          type="submit"
          aria-label="Abmelden"
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
        >
          <LogOut size={16} aria-hidden="true" />
        </button>
      </form>
    </nav>
  );
}
