"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRightLeft, ChevronDown, ExternalLink, Mail, MailOpen, MessageSquare, Paperclip, Phone, Search } from "lucide-react";
import { mailTextAction } from "@/app/(app)/actions";
import type { Activity, Email } from "@/db/schema";
import { relativeTime } from "@/lib/format";
import { Empty, FormError } from "./ui";

const ICON = { notiz: MessageSquare, anruf: Phone, phase: ArrowRightLeft, mail: Mail };
const LABEL = { notiz: "Notiz", anruf: "Anruf", phase: "Phase", mail: "Mail" };
const FILTERS = { alle: "Alle", mails: "Mails", notizen: "Notizen & Anrufe" } as const;

type Item =
  | { kind: "activity"; at: Date; activity: Activity; text: string }
  | { kind: "email"; at: Date; email: Email; text: string };

function MailEntry({ mail }: { mail: Email }) {
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
        </p>
        <p className="text-sm font-semibold">{mail.subject || "(ohne Betreff)"}</p>
        {!open && mail.preview && <p className="mt-1 line-clamp-6 whitespace-pre-line text-[13px] text-muted">{mail.preview}</p>}
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
      </div>
    </li>
  );
}

// Notizen, Anrufe, Phasenwechsel und Mails in einer Zeitleiste, neueste zuerst; optional mit Suche und Filter
export function Timeline({ items, emails = [], searchable = false }: { items: Activity[]; emails?: Email[]; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<keyof typeof FILTERS>("alle");

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

  const q = query.trim().toLowerCase();
  const visible = merged.filter(
    (item) =>
      (filter === "alle" || (filter === "mails" ? item.kind === "email" : item.kind === "activity")) &&
      (!q || item.text.toLowerCase().includes(q)),
  );

  return (
    <>
      {searchable && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3">
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
          <div role="group" aria-label="Filter" className="flex rounded-full bg-line p-1">
            {Object.entries(FILTERS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key as keyof typeof FILTERS)}
                className={`min-h-8 rounded-full px-3.5 text-[13px] font-semibold ${filter === key ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {(q || filter !== "alle") && <span className="text-xs text-muted">{visible.length} von {merged.length}</span>}
        </div>
      )}
      {visible.length === 0 && <Empty>{merged.length ? "Nichts gefunden." : "Noch keine Einträge."}</Empty>}
      <ol>
        {visible.map((item) => {
          if (item.kind === "email") return <MailEntry key={`m${item.email.id}`} mail={item.email} />;
          const a = item.activity;
          const Icon = ICON[a.type];
          return (
            <li key={`a${a.id}`} className="flex gap-3.5 border-t border-line-soft px-5 py-3.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg text-muted">
                <Icon size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  {LABEL[a.type]} · {relativeTime(a.createdAt)}
                </p>
                <p className="whitespace-pre-line text-sm">{a.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
