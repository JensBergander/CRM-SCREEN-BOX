"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  ArrowRightLeft,
  CheckSquare,
  ChevronDown,
  ExternalLink,
  FolderPlus,
  Mail,
  MailOpen,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Phone,
  Search,
  UserPlus,
} from "lucide-react";
import { assignEntryAction, createTaskAction, deleteActivityAction, mailTextAction, updateActivityAction } from "@/app/(app)/actions";
import type { Activity, Email } from "@/db/schema";
import { relativeTime, tidyMailText } from "@/lib/format";
import { btnPrimary, btnQuiet, Empty, FormError, Input, RunningDot, Textarea } from "./ui";
import { PeoplePicker, type PickPerson } from "./people-picker";
import { WhenField } from "./when-field";
import { MailContactPanel } from "./mail-contact";
import type { TagOptions } from "@/lib/service-tags";

// Firmen-Zeitleiste: Absender eingehender Mails als Kontakt übernehmen bzw. Daten ergänzen
export type MailContacts = {
  companyId: number;
  companies: { id: number; name: string }[];
  tagOptions: TagOptions;
  // Mail-ID → bekannter Absender
  known: Record<number, { personId: number; name: string }>;
};

const ICON = { notiz: MessageSquare, anruf: Phone, phase: ArrowRightLeft, mail: Mail };
const LABEL = { notiz: "Notiz", anruf: "Anruf", phase: "Phase", mail: "Mail" };
const FILTERS = { alle: "Alle", notizen: "Notizen", anrufe: "Anrufe", mails: "Mails" } as const;
type Filter = keyof typeof FILTERS | "aufgaben";

// Passt ein Eintrag zum Filter? Phasenwechsel stehen nur unter „Alle“; vom CRM verschickte Mails unter „Mails“
function matches(item: Item, filter: Filter) {
  if (filter === "alle") return true;
  if (filter === "mails") return item.kind === "email" || item.activity.type === "mail";
  if (item.kind === "email") return false;
  return filter === "notizen" ? item.activity.type === "notiz" : filter === "anrufe" ? item.activity.type === "anruf" : false;
}

// company: Kunde des Projekts, wenn Projekte mehrerer Kunden zur Wahl stehen (bei Lieferanten)
export type Project = { id: number; title: string; number: string | null; active: boolean; company?: string };
type Entry = { kind: "mail" | "activity"; id: number; dealId: number | null; companyId: number | null; title: string };

type Item =
  | { kind: "activity"; at: Date; activity: Activity; text: string }
  | { kind: "email"; at: Date; email: Email; text: string };

const pillClass = "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold";

export { RunningDot } from "./ui";

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

function MailEntry({ mail, sender, projects, today, contacts }: { mail: Email; sender?: string; projects: Project[]; today: string; contacts?: MailContacts }) {
  const [full, setFull] = useState<{ text: string } | { error: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [adopt, setAdopt] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = mail.outgoing ? MailOpen : Mail;
  const canAdopt = !!contacts && !mail.outgoing;
  const known = contacts?.known[mail.id];

  const load = () => {
    if (!full) startTransition(async () => setFull(await mailTextAction(mail.id)));
  };
  const toggle = () => {
    setOpen(!open);
    load();
  };
  // Beim Übernehmen die ganze Mail mit Signatur darüber zeigen
  const toggleAdopt = () => {
    if (!adopt) {
      setOpen(true);
      load();
    }
    setAdopt(!adopt);
  };

  return (
    <li className="flex gap-3.5 border-t border-line-soft px-5 py-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info-ink">
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">
          {mail.outgoing ? (
            `Mail an ${mail.toAddresses?.split(",")[0]}`
          ) : known ? (
            <>
              Mail von{" "}
              <Link href={`/kontakte/${known.personId}`} className="font-semibold text-ink hover:underline">{known.name}</Link>
            </>
          ) : (
            `Mail von ${mail.fromName ?? mail.fromAddress}`
          )}{" "}
          · {relativeTime(mail.receivedAt)}
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
          {canAdopt && (
            <button type="button" onClick={toggleAdopt} aria-expanded={adopt} className="inline-flex items-center gap-1 text-muted hover:text-ink">
              <UserPlus size={13} aria-hidden="true" /> {known ? "Daten ergänzen" : "Kontakt übernehmen"}
            </button>
          )}
        </div>
        {adopt && contacts && (
          <MailContactPanel
            mailId={mail.id}
            companies={contacts.companies}
            tagOptions={contacts.tagOptions}
            companyId={mail.companyId ?? contacts.companyId}
            dealId={mail.dealId}
            embedded
            onClose={() => setAdopt(false)}
          />
        )}
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

// Kleines Menü „⋯“ an Notizen und Anrufen
function EntryMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const item = "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-bg";
  return (
    <div ref={ref} className="relative -mr-2 -mt-1 shrink-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Eintrag bearbeiten oder löschen" className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onEdit(); }}>Bearbeiten</button>
          <button type="button" role="menuitem" className={`${item} text-danger-ink`} onClick={() => { setOpen(false); onDelete(); }}>Löschen</button>
        </div>
      )}
    </div>
  );
}

// Notiz oder Anruf an Ort und Stelle ändern: Art, Text, „Mit wem?“ und Zeitpunkt
function EditActivity({ activity, who, people, onDone }: { activity: Activity; who: PickPerson[]; people: PickPerson[]; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateActivityAction.bind(null, activity.id), undefined);
  const [kind, setKind] = useState<"notiz" | "anruf">(activity.type === "anruf" ? "anruf" : "notiz");
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) onDone();
    wasPending.current = pending;
  }, [pending, state, onDone]);
  // bisherige Personen bleiben wählbar, auch wenn sie nicht mehr aktuell bei der Firma sind
  const options = [...people, ...who.filter((w) => !people.some((p) => p.id === w.id))];
  const pill = (on: boolean) => `inline-flex min-h-8 cursor-pointer items-center rounded-full border px-3 text-[12px] font-semibold ${on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted"}`;
  return (
    <form action={action} className="mt-1 flex flex-col gap-2.5 rounded-xl bg-bg p-3">
      <div role="radiogroup" aria-label="Art" className="flex gap-1.5">
        {(["notiz", "anruf"] as const).map((k) => (
          <label key={k} className={pill(kind === k)}>
            <input type="radio" name="type" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {k === "anruf" ? "Anruf" : "Notiz"}
          </label>
        ))}
      </div>
      <label>
        <span className="sr-only">Text</span>
        <Textarea name="body" rows={Math.min(12, Math.max(3, activity.body.split("\n").length + 1))} defaultValue={activity.body} required autoFocus className="resize-y bg-surface py-2" />
      </label>
      <PeoplePicker people={options} initial={who.map((w) => w.id)} small allowNew={!!activity.companyId} />
      <WhenField initial={activity.createdAt} />
      <FormError message={state?.error} />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Speichern"}</button>
        <button type="button" onClick={onDone} className={btnQuiet}>Abbrechen</button>
      </div>
    </form>
  );
}

function ActivityEntry({ activity: a, who, people, projects, today }: { activity: Activity; who: PickPerson[]; people: PickPerson[]; projects: Project[]; today: string }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const Icon = ICON[a.type];
  const editable = a.type === "notiz" || a.type === "anruf";
  // Verlorene Vorgänge hervorheben, damit Grund und Notiz beim nächsten Kontakt auffallen
  const lost = a.type === "phase" && a.body.includes("→ Abgelehnt / Verloren");
  const remove = () =>
    startTransition(async () => {
      const result = await deleteActivityAction(a.id);
      if (result.error) setError(result.error);
    });
  return (
    <li className={`flex gap-3.5 border-t border-line-soft px-5 py-3.5 ${lost ? "bg-danger-soft/50" : ""}`}>
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${lost ? "bg-danger-soft text-danger-ink" : "bg-bg text-muted"}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`flex-1 text-xs ${lost ? "font-semibold text-danger-ink" : "text-muted"}`}>
            {lost ? "Verloren" : LABEL[a.type]} · {relativeTime(a.createdAt)}
            {a.editedAt && <span title={`bearbeitet am ${relativeTime(a.editedAt)}`}> · bearbeitet</span>}
          </p>
          {editable && mode === "view" && <EntryMenu onEdit={() => setMode("edit")} onDelete={() => setMode("delete")} />}
        </div>
        {mode === "edit" ? (
          <EditActivity activity={a} who={who} people={people} onDone={() => setMode("view")} />
        ) : (
          <>
            <p className="whitespace-pre-line text-sm">{a.body}</p>
            {who.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                Mit{" "}
                {who.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <Link href={`/kontakte/${p.id}`} className="font-semibold text-ink hover:underline">{p.name}</Link>
                  </span>
                ))}
              </p>
            )}
          </>
        )}
        {mode === "delete" && (
          <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft/60 p-3 text-sm">
            <span className="flex-1">{a.type === "anruf" ? "Diesen Anruf" : "Diese Notiz"} wirklich löschen?</span>
            <button type="button" disabled={pending} onClick={remove} className={`${btnQuiet} text-danger-ink`}>{pending ? "Löscht …" : "Löschen"}</button>
            <button type="button" disabled={pending} onClick={() => setMode("view")} className={btnQuiet}>Abbrechen</button>
            <FormError message={error} />
          </div>
        )}
        {a.type !== "phase" && mode === "view" && (
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
  peopleOf = {},
  peopleFor = {},
  tasks,
  mailContacts,
}: {
  items: Activity[];
  emails?: Email[];
  // Namen fremder Absender-Firmen (Lieferanten-Mails in Kundenprojekten), nach Firmen-ID
  senders?: Record<number, string>;
  searchable?: boolean;
  projects?: Project[];
  projectFilter?: boolean;
  today?: string;
  // Mit wem? Personen je Notiz/Anruf (Aktivitäts-ID → Personen), verlinkt auf die Kontaktseite
  peopleOf?: Record<number, { id: number; name: string }[]>;
  // Auswahl „Mit wem?“ beim Bearbeiten: aktuelle Kontakte je Firma (Firmen-ID → Personen)
  peopleFor?: Record<number, PickPerson[]>;
  // optionaler Filter „Aufgaben“ (z. B. auf der Kontaktseite): zeigt statt der Einträge diese Liste
  tasks?: { count: number; content: ReactNode };
  mailContacts?: MailContacts;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
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
      matches(item, filter) &&
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
                <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key as Filter)} className={chip(filter === key)}>
                  {label}
                </button>
              ))}
              {tasks && (
                <button type="button" aria-pressed={filter === "aufgaben"} onClick={() => setFilter("aufgaben")} className={chip(filter === "aufgaben")}>
                  Aufgaben{tasks.count > 0 && ` ${tasks.count}`}
                </button>
              )}
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
          {(q || (filter !== "alle" && filter !== "aufgaben") || project !== "alle") && <span className="text-xs text-muted">{visible.length} von {merged.length}</span>}
        </div>
      )}
      {filter === "aufgaben" && tasks ? tasks.content : <>
      {visible.length === 0 && <Empty>{merged.length ? "Nichts gefunden." : "Noch keine Einträge."}</Empty>}
      <ol>
        {visible.map((item) => {
          if (item.kind === "email") return <MailEntry key={`m${item.email.id}`} mail={item.email} sender={item.email.companyId ? senders[item.email.companyId] : undefined} projects={projects} today={today} contacts={mailContacts} />;
          const a = item.activity;
          return (
            <ActivityEntry
              key={`a${a.id}`}
              activity={a}
              who={peopleOf[a.id] ?? []}
              people={a.companyId ? peopleFor[a.companyId] ?? [] : []}
              projects={projects}
              today={today}
            />
          );
        })}
      </ol>
      </>}
    </>
  );
}
