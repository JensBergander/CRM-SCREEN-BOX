"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, Menu, Plus, X } from "lucide-react";
import { AREAS, NAV_GROUPS, type Area } from "@/lib/areas";
import { TONE_SOFT, TONE_TEXT } from "@/lib/tones";
import { SearchButton } from "./global-search";

const isActive = (href: string, pathname: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink">
        <span className="h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      <span className="text-[15px] font-bold tracking-wide">
        SCREEN-BOX <span className="font-medium text-muted">CRM</span>
      </span>
    </Link>
  );
}

// Alle Bereiche in Gruppen; gleiche Liste in der Seitenleiste (Desktop) und im Menü (Handy)
function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group, i) => (
        <div key={group.title ?? i} className="flex flex-col gap-0.5 pt-3 first-of-type:pt-0">
          {group.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{group.title}</p>}
          {group.areas.map((key) => {
            const { href, label, icon: Icon, tone } = AREAS[key];
            const active = isActive(href, pathname);
            // Aktiver Punkt: zarter Hintergrund in Bereichsfarbe, neutrale Bereiche wie bisher grau
            const activeBg = tone === "neutral" ? "bg-bg" : TONE_SOFT[tone].split(" ")[0];
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm md:min-h-10 ${
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
    </>
  );
}

function NewOrder({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/vorgaenge/neu?schnell=1"
      onClick={onNavigate}
      className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent-strong text-sm font-semibold text-white hover:bg-accent-ink"
    >
      <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
      Neuer Auftrag
    </Link>
  );
}

function Account({ userName }: { userName: string }) {
  return (
    <form action="/api/auth/logout" method="post" className="flex items-center gap-2 px-3">
      <span className="flex-1 truncate text-xs text-muted">{userName}</span>
      <button type="submit" aria-label="Abmelden" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
        <LogOut size={16} aria-hidden="true" />
      </button>
    </form>
  );
}

// Handy: die meistgenutzten Bereiche unten im Daumenbereich, alles Weitere unter „Mehr“
const TABS: Area[] = ["start", "vorgaenge", "posteingang", "aufgaben"];

function MobileNav({ userName, pathname }: { userName: string; pathname: string }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  // „Mehr“ ist aktiv, wenn die aktuelle Seite nicht unten als Tab steht
  const moreActive = !TABS.some((key) => isActive(AREAS[key].href, pathname));

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-surface/95 pl-4 pr-2 backdrop-blur md:hidden">
        <div className="flex-1">
          <Logo />
        </div>
        <SearchButton variant="icon" />
        <Link href="/vorgaenge/neu?schnell=1" aria-label="Neuer Auftrag" className="flex h-11 w-11 items-center justify-center rounded-full text-accent-ink hover:bg-accent-soft">
          <Plus size={20} strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </header>

      <nav aria-label="Hauptbereiche" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map((key) => {
            const { href, label, icon: Icon } = AREAS[key];
            const active = isActive(href, pathname);
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-semibold text-ink" : "font-medium text-muted"}`}
                >
                  <Icon size={20} strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] ${moreActive ? "font-semibold text-ink" : "font-medium text-muted"}`}
            >
              <Menu size={20} strokeWidth={moreActive ? 2.1 : 1.8} aria-hidden="true" />
              Mehr
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-40 bg-ink/40 md:hidden" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={panel}
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 right-0 flex w-[min(320px,86vw)] flex-col gap-1 overflow-y-auto bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-xl"
          >
            <div className="flex items-center justify-between pb-3 pl-3">
              <span className="text-sm font-semibold text-muted">Navigation</span>
              <button type="button" onClick={close} aria-label="Menü schließen" className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={close} />
            <div className="min-h-6 flex-1" />
            <NewOrder onNavigate={close} />
            <div className="mt-3">
              <Account userName={userName} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <>
      <MobileNav userName={userName} pathname={pathname} />
      <nav
        aria-label="Hauptnavigation"
        className="hidden shrink-0 flex-col gap-1 border-r border-line bg-surface px-4 py-6 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:overflow-y-auto"
      >
        <div className="px-3 pb-4">
          <Logo />
        </div>
        <SearchButton variant="field" />
        <NavLinks pathname={pathname} />
        <div className="min-h-6 flex-1" />
        <NewOrder />
        <div className="mt-4">
          <Account userName={userName} />
        </div>
      </nav>
    </>
  );
}
