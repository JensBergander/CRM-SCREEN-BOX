"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CheckSquare,
  Columns3,
  Handshake,
  Home,
  Inbox,
  LogOut,
  Plus,
  Settings,
  Swords,
  Users,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Start", icon: Home },
  { href: "/vorgaenge", label: "Vorgänge", icon: Columns3 },
  { href: "/firmen", label: "Firmen", icon: Building2 },
  { href: "/kontakte", label: "Kontakte", icon: Users },
  { href: "/dienstleister", label: "Dienstleister", icon: Handshake },
  { href: "/wettbewerber", label: "Wettbewerber", icon: Swords },
  { href: "/posteingang", label: "Posteingang", icon: Inbox },
  { href: "/aufgaben", label: "Aufgaben", icon: CheckSquare },
  { href: "/auswertungen", label: "Auswertungen", icon: BarChart3 },
  { href: "/einstellungen", label: "Einstellungen", icon: Settings },
];

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hauptnavigation"
      className="flex shrink-0 flex-col gap-1 border-line bg-surface px-4 py-6 md:sticky md:top-0 md:h-screen md:w-60 md:border-r"
    >
      <div className="flex items-center gap-2.5 px-3 pb-6">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" />
        </div>
        <span className="text-[15px] font-bold tracking-wide">
          SCREEN-BOX <span className="font-medium text-muted">CRM</span>
        </span>
      </div>

      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-[10px] px-3 text-sm ${
              active ? "bg-bg font-semibold text-ink" : "font-medium text-muted hover:text-ink"
            }`}
          >
            <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            {label}
          </Link>
        );
      })}

      <div className="min-h-6 flex-1" />

      <Link
        href="/vorgaenge/neu?schnell=1"
        className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink text-sm font-semibold text-surface"
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
