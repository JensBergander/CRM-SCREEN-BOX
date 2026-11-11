"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { Building2, CheckSquare, FileText, FolderPlus, Inbox, Search, User, X, Zap } from "lucide-react";
import { globalSearchAction, recentPagesAction } from "@/app/(app)/actions";
import type { SearchHit, SearchResult } from "@/lib/search";
import { KIND_LABEL, KIND_TONE, TONE_SOFT } from "@/lib/tones";
import { STAGE_DOT, STAGE_LABEL } from "@/lib/labels";

const OPEN_EVENT = "crm-search-open";
const RECENT_KEY = "crm-recent";
const RECENT_PAGE = /^\/(firmen|kontakte|vorgaenge)\/\d+$/;

const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((p) => typeof p === "string" && RECENT_PAGE.test(p)).slice(0, 6) : [];
  } catch {
    return [];
  }
}

// Feld oben in der Seitenleiste (ab Tablet) bzw. Lupe (Handy); beide öffnen dieselbe Suche
export function SearchButton({ variant }: { variant: "field" | "icon" }) {
  const mac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );
  if (variant === "icon") {
    return (
      <button type="button" onClick={openSearch} aria-label="Suchen" className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink md:hidden">
        <Search size={19} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={openSearch}
      className="mb-3 hidden min-h-10 w-full items-center gap-2 rounded-[10px] border border-line bg-bg px-3 text-left text-sm text-muted hover:border-ink hover:text-ink md:flex"
    >
      <Search size={16} aria-hidden="true" />
      <span className="flex-1">Suchen …</span>
      <kbd className="rounded-md border border-line bg-surface px-1.5 font-sans text-[11px]">{mac ? "⌘K" : "Strg K"}</kbd>
    </button>
  );
}

type Item = { key: string; href: string; icon: ReactNode; title: string; sub?: ReactNode; badge?: ReactNode; approx?: boolean };

const QUICK: Item[] = [
  { key: "q-auftrag", href: "/vorgaenge/neu?schnell=1", icon: <Zap size={16} />, title: "Neuer Auftrag" },
  { key: "q-vorgang", href: "/vorgaenge/neu", icon: <FolderPlus size={16} />, title: "Neuer Vorgang" },
  { key: "q-firma", href: "/firmen/neu", icon: <Building2 size={16} />, title: "Neue Firma" },
  { key: "q-kontakt", href: "/kontakte/neu", icon: <User size={16} />, title: "Neuer Kontakt" },
  { key: "q-aufgaben", href: "/aufgaben", icon: <CheckSquare size={16} />, title: "Aufgaben" },
  { key: "q-posteingang", href: "/posteingang", icon: <Inbox size={16} />, title: "Posteingang" },
];

function toItem(hit: SearchHit): Item {
  const icon = hit.kind === "firma" ? <Building2 size={16} /> : hit.kind === "kontakt" ? <User size={16} /> : <FileText size={16} />;
  const badge = hit.companyKind ? (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONE_SOFT[KIND_TONE[hit.companyKind]]}`}>{KIND_LABEL[hit.companyKind]}</span>
  ) : undefined;
  const sub = hit.stage ? (
    <>
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${STAGE_DOT[hit.stage]}`} aria-hidden="true" />
      {[hit.sub, STAGE_LABEL[hit.stage]].filter(Boolean).join(" · ")}
    </>
  ) : (
    hit.sub ?? undefined
  );
  return { key: hit.href, href: hit.href, icon, title: hit.title, sub, badge, approx: hit.approx };
}

// Die Suche als Fenster (Handy: Vollbild). Einmal im Layout eingebunden; merkt sich auch die zuletzt geöffneten Seiten.
export function SearchPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; data: SearchResult } | null>(null);
  const [recent, setRecent] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const request = useRef(0);

  // zuletzt geöffnete Firmen, Kontakte und Vorgänge (neueste zuerst, höchstens sechs)
  useEffect(() => {
    if (!RECENT_PAGE.test(pathname)) return;
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify([pathname, ...readRecent().filter((p) => p !== pathname)].slice(0, 6)));
    } catch {
      // ohne Speicher gibt es eben keine Liste
    }
  }, [pathname]);

  // ⌘K / Strg+K überall, „/“ nur, wenn gerade nichts getippt wird; geöffnet wird immer mit leerem Feld
  const isOpen = useRef(false);
  useEffect(() => {
    isOpen.current = open;
  }, [open]);
  useEffect(() => {
    const show = () => {
      setQuery("");
      setResult(null);
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen.current) setOpen(false);
        else show();
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        show();
      }
    };
    const onOpen = () => show();
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Beim Öffnen: Fokus ins Feld, zuletzt geöffnete Seiten mit aktuellen Namen laden
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const paths = readRecent();
    if (paths.length) startTransition(async () => setRecent(await recentPagesAction(paths)));
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Live-Suche ab 2 Zeichen, kurz entprellt; spätere Antworten gewinnen
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) return;
    const id = ++request.current;
    const timer = setTimeout(async () => {
      const data = await globalSearchAction(q);
      if (id === request.current) {
        setResult({ q, data });
        setActive(0);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [q]);

  const groups = useMemo<{ title: string; items: Item[] }[]>(() => {
    if (q.length < 2) {
      return [
        ...(recent.length ? [{ title: "Zuletzt geöffnet", items: recent.map(toItem) }] : []),
        { title: "Schnellaktionen", items: QUICK },
      ];
    }
    const data = result?.data;
    const more: Item = {
      key: "mehr",
      href: `/suche?q=${encodeURIComponent(q)}`,
      icon: <Search size={16} />,
      title: "Auch in Mails und Notizen suchen …",
      sub: `„${q}“`,
    };
    if (!data) return [{ title: "", items: [more] }];
    return [
      { title: "Firmen", items: data.firmen.map(toItem) },
      { title: "Kontakte", items: data.kontakte.map(toItem) },
      { title: "Vorgänge", items: data.vorgaenge.map(toItem) },
      { title: "", items: [more] },
    ].filter((g) => g.items.length);
  }, [q, recent, result]);

  const flat = groups.flatMap((g) => g.items);
  const searching = q.length >= 2 && result?.q !== q;
  const empty = q.length >= 2 && !!result && result.q === q && flat.length === 1;

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      go(flat[active].href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  let index = -1;
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 md:px-4 md:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Suche" className="mx-auto flex h-full flex-col bg-surface shadow-xl md:h-auto md:max-h-[72vh] md:max-w-xl md:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2">
          <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Firma, Kontakt, Vorgang oder Nummer"
            aria-label="Suchen"
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-list"
            aria-activedescendant={flat[active] ? `gs-${active}` : undefined}
            autoComplete="off"
            className="min-h-12 flex-1 bg-transparent text-base outline-none"
          />
          {searching && <span className="text-xs text-muted">sucht …</span>}
          <button type="button" onClick={() => setOpen(false)} aria-label="Suche schließen" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div ref={listRef} id="global-search-list" role="listbox" aria-label="Treffer" className="flex-1 overflow-y-auto p-2">
          {empty && <p className="px-3 py-3 text-sm text-muted">Keine Firma, kein Kontakt und kein Vorgang gefunden.</p>}
          {groups.map((g, gi) => (
            <div key={g.title || `g${gi}`} role="group" aria-label={g.title || undefined} className="pb-1">
              {g.title && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.title}</p>}
              {g.items.map((item) => {
                index += 1;
                const i = index;
                const on = i === active;
                return (
                  <Link
                    key={item.key}
                    id={`gs-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={on}
                    href={item.href}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                      e.preventDefault();
                      go(item.href);
                    }}
                    onMouseMove={() => active !== i && setActive(i)}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm ${on ? "bg-bg" : ""}`}
                  >
                    <span className="shrink-0 text-muted" aria-hidden="true">{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.title}</span>
                      {item.sub && <span className="block truncate text-xs text-muted">{item.sub}</span>}
                    </span>
                    {item.approx && <span className="shrink-0 text-[11px] text-muted">ähnlich</span>}
                    {item.badge}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
