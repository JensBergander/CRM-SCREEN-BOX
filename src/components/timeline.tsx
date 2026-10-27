"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  CheckSquare,
  ChevronDown,
  ExternalLink,
  FolderPlus,
  Mail,
  MailOpen,
  MessageSquare,
  Paperclip,
  Phone,
  Search,
} from "lucide-react";
import { assignEntryAction, createTaskAction, mailTextAction } from "@/app/(app)/actions";
import type { Activity, Email } from "@/db/schema";
import { relativeTime, tidyMailText } from "@/lib/format";
import { btnQuiet, Empty, FormError, Input } from "./ui";

const ICON = { notiz: MessageSquare, anruf: Phone, phase: ArrowRightLeft, mail: Mail };
const LABEL = { notiz: "Notiz", anruf: "Anruf", phase: "Phase", mail: "Mail" };
const FILTERS = { alle: "Alle", mails: "Mails", notizen: "Notizen & Anrufe" } as const;

// company: Kunde des Projekts, wenn Projekte mehrerer Kunden zur Wahl stehen (bei Lieferanten)
export type Project = { id: number; title: string; number: string | null; active: boolean; company?: string };
type Entry = { kind: "mail" | "activity"; id: number; dealId: number | null; companyId: number | null; title: string };

type Item =
  | { kind: "activity"; at: Date; activity: Activity; text: string }
  | { kind: "email"; at: Date; email: Email; text: string };

const pillClass = "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold";

// Grüner Punkt für laufende Projekte
export function RunningDot() {
  return <span className="h-2 w-2 shrink-0 rounded-full bg-ok" aria-label="läuft" />;
}

// Auswahlliste der Projekte; bei vielen mit Suchfeld (Projekt, Nummer oder Kunde)
function ProjectMenu({ projects, onPick, onClear, heading }: { projects: Project[]; onPick: (id: number) => void; onClear?: () => void; heading: string }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const list = projects.filter((p) => !q || [p.title, p.number, p.company].some((v) => v?.toLowerCase().includes(q)));
  return (
    <div role="menu" className="absolute left-0 top-full z-20 mt-1 flex max-h-96 w-72 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg">
      {projects.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-muted">{heading}</p>}
      {projects.length > 6 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Projekt oder Kunde suchen"
          aria-label="Projekt oder Kunde suchen"
          autoFocus
          className="mx-1 mb-1 min-h-9 rounded-lg border border-line px-3 text-sm outline-none focus:border-ink"
        />
      )}
      <div className="overflow-auto">
        {list.map((p) => (
          <button key={p.id} type="button" role="menuitem" onClick={() => onPick(p.id)} className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg">
            <span className="mt-1.5"><RunningDot /></span>
            <span className="min-w-0">
              <span className="block truncate">{p.title}</span>
              {p.company && <span className="block truncate text-xs text-muted">{p.company}</span>}
            </span>
          </button>
        ))}
        {q && list.length === 0 && <p className="px-3 py-2 text-sm text-muted">Kein Projekt gefunden.</p>}
      </div>
      {onClear && (
        <button type="button" role="menuitem" onClick={onClear} className="rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-bg">
          Zuordnung lösen
        </button>
      )}
    </div>
  );
}

// Projekt-Pill eines zugeordneten Eintrags mit Menü zum Umhängen oder Lösen; ohne Zuordnung die aktiven Projekte
// als Knöpfe, bei vielen oder fremden Projekten (Lieferanten) ein Knopf mit Suchmenü
function ProjectControl({ entry, projects }: { entry: Entry; projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const active = projects.filter((p) => p.active);
  const current = projects.find((p) => p.id === entry.dealId);
  const assign = (dealId: number | null) => {
    setOpen(false);
    startTransition(() => assignEntryAction({ kind: entry.kind, id: entry.id }, dealId));
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (current) {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`Projekt ${current.title}, Zuordnung ändern`}
          className={`${pillClass} ${current.active ? "bg-ink text-surface" : "bg-line text-ink"}`}
        >
          {current.active && <RunningDot />}
          {current.company ? `${current.company} · ${current.title}` : current.title}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {open && <ProjectMenu projects={active.filter((p) => p.id !== current.id)} heading="Anderem Projekt zuordnen" onPick={assign} onClear={() => assign(null)} />}
      </div>
    );
  }

  if (!active.length) return null;
  if (active.length > 3 || active.some((p) => p.company)) {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={pending}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`${pillClass} border border-dashed border-line text-muted hover:border-ink hover:text-ink`}
        >
          → Projekt zuordnen
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {open && <ProjectMenu projects={active} heading="Laufende Projekte" onPick={assign} />}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Einem Projekt zuordnen">
      {active.map((p) => (
        <button key={p.id} type="button" disabled={pending} onClick={() => assign(p.id)} className={`${pillClass} border border-dashed border-line text-muted hover:border-ink hover:text-ink`}>
          <RunningDot />→ {p.title}
        </button>
      ))}
    </div>
  );
}

// „Aufgabe daraus“: vorausgefüllte Zeile mit Titel, Fälligkeit und Projekt
function TaskInline({ entry, projects, today, onDone }: { entry: Entry; projects: Project[]; today: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(createTaskAction, undefined);
  const active = projects.filter((p) => p.active);
  const preset = entry.dealId ?? active[0]?.id ?? null;
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) onDone();
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form action={action} className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-bg p-3">
      {entry.companyId && <input type="hidden" name="companyId" value={entry.companyId} />}
      <label className="min-w-0 flex-[1_1_240px]">
        <span className="sr-only">Aufgabe</span>
        <Input name="title" defaultValue={entry.title.slice(0, 200)} required autoFocus />
      </label>
      <label>
        <span className="sr-only">Fällig am</span>
        <Input name="dueDate" type="date" defaultValue={today} className="w-auto" />
      </label>
      {(active.length > 0 || entry.dealId) && (
        <label>
          <span className="sr-only">Projekt</span>
          <select name="dealId" defaultValue={preset ?? ""} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm">
            {projects
              .filter((p) => p.active || p.id === entry.dealId)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            <option value="">Nur Firma</option>
          </select>
        </label>
      )}
      <button type="submit" disabled={pending} className={btnQuiet}>{pending ? "Speichert …" : "Aufgabe anlegen"}</button>
      <FormError message={state?.error} />
    </form>
  );
}

function EntryActions({ entry, projects, newDealHref, today }: { entry: Entry; projects: Project[]; newDealHref: string; today: string }) {
  const [task, setTask] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
        {projects.length > 0 && <ProjectControl entry={entry} projects={projects} />}
        <button type="button" onClick={() => { setTask(!task); setDone(false); }} aria-expanded={task} className="inline-flex items-center gap-1 text-muted hover:text-ink">
          <CheckSquare size={13} aria-hidden="true" /> Aufgabe daraus
        </button>
        <Link href={newDealHref} className="inline-flex items-center gap-1 text-muted hover:text-ink">
          <FolderPlus size={13} aria-hidden="true" /> Vorgang daraus
        </Link>
        {done && <span role="status" className="text-xs text-muted">Aufgabe angelegt</span>}
      </div>
      {task && <TaskInline entry={entry} projects={projects} today={today} onDone={() => { setTask(false); setDone(true); }} />}
    </>
  );
}

function MailEntry({ mail, sender, projects, today }: { mail: Email; sender?: string; projects: Project[]; today: string }) {
  const [full, setFull] = useState<{ text: string } | { error: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = mail.outgoing ? MailOpen : Mail;

  const toggle = () => {
    setOpen(!open);
    if (!full) startTransition(async () => setFull(await mailTextAction(mail.id)));
  };

  return (
    <li className="flex gap-3.5 border-t border-line-soft px-5 py-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info-ink">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">
          {mail.outgoing ? `Mail an ${mail.toAddresses?.split(",")[0]}` : `Mail von ${mail.fromName ?? mail.fromAddress}`} · {relativeTime(mail.receivedAt)}
          {mail.hasAttachments && <Paperclip size={12} className="ml-1 inline" aria-label="mit Anhang" />}
          {sender && mail.companyId && (
            <Link href={`/firmen/${mail.companyId}`} className="ml-2 rounded-md bg-line-soft px-1.5 py-0.5 text-[11px] font-semibold text-ink">
              Lieferant: {sender}
            </Link>
          )}
        </p>
        <p className="text-sm font-semibold">{mail.subject || "(ohne Betreff)"}</p>
        {!open && mail.preview && <p className="mt-1 line-clamp-6 whitespace-pre-line text-[13px] text-muted">{tidyMailText(mail.preview)}</p>}
        {open && (
          <div className="mt-2 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-[13px] leading-relaxed">
            {pending || !full ? "Wird geladen …" : "error" in full ? <FormError message={full.error} /> : full.text || "(kein Text)"}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
          <button type="button" onClick={toggle} aria-expanded={open} className="inline-flex items-center gap-1 font-semibold">
            {open ? "Einklappen" : "Ganze Mail lesen"}
            <ChevronDown size={14} className={open ? "rotate-180" : ""} aria-hidden="true" />
          </button>
          {mail.webLink && (
            <a href={mail.webLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">
              <ExternalLink size={13} aria-hidden="true" /> In Outlook
            </a>
          )}
        </div>
        <EntryActions
          entry={{ kind: "mail", id: mail.id, dealId: mail.dealId, companyId: mail.companyId, title: (mail.subject ?? "Mail").replace(/^(AW|WG|RE|FW|Fwd):\s*/i, "") }}
          projects={projects}
          newDealHref={`/vorgaenge/neu?mail=${mail.id}`}
          today={today}
        />
      </div>
    </li>
  );
}

// Notizen, Anrufe, Phasenwechsel und Mails in einer Zeitleiste, neueste zuerst; optional mit Suche, Filter und Projektzuordnung
export function Timeline({
  items,
  emails = [],
  senders = {},
  searchable = false,
  projects = [],
  projectFilter = false,
  today = "",
}: {
  items: Activity[];
  emails?: Email[];
  // Namen fremder Absender-Firmen (Lieferanten-Mails in Kundenprojekten), nach Firmen-ID
  senders?: Record<number, string>;
  searchable?: boolean;
  projects?: Project[];
  projectFilter?: boolean;
  today?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<keyof typeof FILTERS>("alle");
  const [project, setProject] = useState<number | "alle" | "ohne">("alle");

  const merged = useMemo<Item[]>(
    () =>
      [
        ...items.map((activity) => ({ kind: "activity" as const, at: activity.createdAt, activity, text: activity.body })),
        ...emails.map((email) => ({
          kind: "email" as const,
          at: email.receivedAt,
          email,
          text: [email.subject, email.preview, email.fromName, email.fromAddress, email.toAddresses].filter(Boolean).join(" "),
        })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime()),
    [items, emails],
  );

  const dealOf = (item: Item) => (item.kind === "email" ? item.email.dealId : item.activity.dealId);
  // Im Filter: aktive Projekte und abgeschlossene, denen Einträge zugeordnet sind;
  // bei Lieferanten (Projekte fremder Kunden) nur die, denen Einträge zugeordnet sind
  const used = new Set(merged.map(dealOf).filter(Boolean));
  const filterProjects = projects.filter((p) => (p.active && !p.company) || used.has(p.id));

  const q = query.trim().toLowerCase();
  const visible = merged.filter(
    (item) =>
      (filter === "alle" || (filter === "mails" ? item.kind === "email" : item.kind === "activity")) &&
      (project === "alle" || (project === "ohne" ? !dealOf(item) : dealOf(item) === project)) &&
      (!q || item.text.toLowerCase().includes(q)),
  );
  const chip = (on: boolean) => `min-h-8 rounded-full px-3.5 text-[13px] font-semibold ${on ? "bg-surface shadow-sm" : "text-muted"}`;

  return (
    <>
      {searchable && (
        <div className="flex flex-col gap-2 border-t border-line-soft px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-10 flex-[1_1_220px] items-center gap-2 rounded-full border border-line bg-surface px-4 text-muted">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Zeitleiste durchsuchen</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="In Mails und Notizen suchen"
                className="flex-1 bg-transparent text-sm text-ink outline-none"
              />
            </label>
            <div role="group" aria-label="Art" className="flex rounded-full bg-line p-1">
              {Object.entries(FILTERS).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key as keyof typeof FILTERS)} className={chip(filter === key)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {projectFilter && filterProjects.length > 0 && (
            <div role="group" aria-label="Projekt" className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted">Projekt:</span>
              {[
                { key: "alle" as const, label: "Alle" },
                ...filterProjects.map((p) => ({ key: p.id, label: p.title, active: p.active })),
                { key: "ohne" as const, label: "Ohne Projekt" },
              ].map((o) => (
                <button
                  key={String(o.key)}
                  type="button"
                  aria-pressed={project === o.key}
                  onClick={() => setProject(o.key)}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold ${project === o.key ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted hover:text-ink"}`}
                >
                  {"active" in o && o.active && <RunningDot />}
                  {o.label}
                </button>
              ))}
            </div>
          )}
          {(q || filter !== "alle" || project !== "alle") && <span className="text-xs text-muted">{visible.length} von {merged.length}</span>}
        </div>
      )}
      {visible.length === 0 && <Empty>{merged.length ? "Nichts gefunden." : "Noch keine Einträge."}</Empty>}
      <ol>
        {visible.map((item) => {
          if (item.kind === "email") return <MailEntry key={`m${item.email.id}`} mail={item.email} sender={item.email.companyId ? senders[item.email.companyId] : undefined} projects={projects} today={today} />;
          const a = item.activity;
          const Icon = ICON[a.type];
          // Verlorene Vorgänge hervorheben, damit Grund und Notiz beim nächsten Kontakt auffallen
          const lost = a.type === "phase" && a.body.includes("→ Abgelehnt / Verloren");
          return (
            <li key={`a${a.id}`} className={`flex gap-3.5 border-t border-line-soft px-5 py-3.5 ${lost ? "bg-danger-soft/50" : ""}`}>
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${lost ? "bg-danger-soft text-danger-ink" : "bg-bg text-muted"}`}>
                <Icon size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs ${lost ? "font-semibold text-danger-ink" : "text-muted"}`}>
                  {lost ? "Verloren" : LABEL[a.type]} · {relativeTime(a.createdAt)}
                </p>
                <p className="whitespace-pre-line text-sm">{a.body}</p>
                {a.type !== "phase" && (
                  <EntryActions
                    entry={{ kind: "activity", id: a.id, dealId: a.dealId, companyId: a.companyId, title: a.body.split("\n")[0] }}
                    projects={projects}
                    newDealHref={`/vorgaenge/neu?notiz=${a.id}`}
                    today={today}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
