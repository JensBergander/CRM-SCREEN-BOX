"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { BellOff, CheckSquare, ExternalLink, FolderPlus, Paperclip, RefreshCw, UserPlus, X } from "lucide-react";
import { ignoreMailAction, ignoreSenderAction, syncMailAction, taskFromMailAction } from "@/app/(app)/actions";
import { relativeTime } from "@/lib/format";
import type { TagOptions } from "@/lib/service-tags";
import type { InboxRow } from "@/lib/queries";
import type { SyncResult } from "@/lib/mail";
import { MailContactPanel } from "./mail-contact";
import { btnPrimary, btnQuiet, Empty, FormError, RunningDot } from "./ui";

export function SyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | { error: string } | null>(null);
  const errors = result && ("error" in result ? [result.error] : result.filter((r) => r.error).map((r) => `${r.mailbox}: ${r.error}`));
  const fetched = result && !("error" in result) ? result.reduce((s, r) => s + r.fetched, 0) : 0;
  const more = result && !("error" in result) && result.some((r) => !r.done && !r.error);

  return (
    <div className="flex flex-col items-end gap-2">
      <button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await syncMailAction()))} className={btnPrimary}>
        <RefreshCw size={16} className={pending ? "animate-spin" : ""} aria-hidden="true" />
        {pending ? "Ruft ab …" : "Jetzt abrufen"}
      </button>
      {errors && errors.length > 0 && <FormError message={errors.join(" · ")} />}
      {result && errors?.length === 0 && (
        <p role="status" className="text-[13px] text-muted">
          {fetched} Mails abgerufen{more ? ", es gibt noch ältere: bitte noch einmal klicken" : ""}.
        </p>
      )}
    </div>
  );
}

export function InboxList({ rows, companies, tagOptions, initialOpen = null }: {
  rows: InboxRow[];
  companies: { id: number; name: string }[];
  tagOptions: TagOptions;
  // aus der Startseite: diese Mail gleich zum Lesen und Zuordnen öffnen
  initialOpen?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(initialOpen);
  const [note, setNote] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // geöffnete Mail nach oben holen (beim Start und nach dem Weiterspringen)
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (open) document.getElementById(`mail-${open}`)?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
  }, [open]);
  // Nach Zuordnen oder Ignorieren gleich die nächste Mail öffnen; die Reihenfolge der Liste gilt von vor dem Neuladen
  const order = rows.map((r) => r.mail.id).join(",");
  const next = useCallback(
    (id: number, message: string) => {
      const ids = order.split(",").map(Number);
      const following = ids[ids.indexOf(id) + 1] ?? null;
      setOpen(following);
      setNote(following ? `${message} Weiter mit der nächsten Mail.` : `${message} Das war die letzte Mail in dieser Ansicht.`);
    },
    [order],
  );
  const ignore = (id: number, wasOpen: boolean) =>
    startTransition(async () => {
      if (wasOpen) next(id, "Ignoriert.");
      await ignoreMailAction(id);
    });
  if (!rows.length) return <Empty>{note ?? "Keine Mails in dieser Ansicht."}</Empty>;

  return (
    <ul>
      {rows.map((row) => {
        const m = row.mail;
        return (
          <li key={m.id} id={`mail-${m.id}`} className="scroll-mt-4 border-t border-line-soft px-5 py-4">
            {open === m.id && note && (
              <p role="status" className="mb-2 text-xs font-semibold text-muted">{note}</p>
            )}
            <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
              <div className="min-w-0 flex-[1_1_380px]">
                <p className="text-xs text-muted">
                  {m.outgoing ? `an ${m.toAddresses}` : `${m.fromName ?? ""} <${m.fromAddress}> an ${m.toAddresses?.split(",")[0] ?? m.mailbox}`} ·{" "}
                  {relativeTime(m.receivedAt)}
                  {m.hasAttachments && <Paperclip size={12} className="ml-1 inline" aria-label="mit Anhang" />}
                </p>
                <p className="mt-0.5 text-sm font-semibold">{m.subject || "(ohne Betreff)"}</p>
                {m.preview && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{m.preview}</p>}
                {row.companyName && (
                  <p className="mt-1 text-xs">
                    Zugeordnet: <Link href={`/firmen/${m.companyId}`} className="font-semibold hover:underline">{row.companyName}</Link>
                    {row.dealTitle && (
                      <Link href={`/vorgaenge/${m.dealId}`} className="ml-2 inline-flex min-h-6 items-center gap-1.5 rounded-full bg-ink px-2.5 text-[11px] font-semibold text-surface">
                        {!!Number(row.dealActive) && <RunningDot />}
                        {row.dealTitle}
                      </Link>
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.webLink && (
                  <a href={m.webLink} target="_blank" rel="noreferrer" className={btnQuiet} aria-label="In Outlook öffnen">
                    <ExternalLink size={14} aria-hidden="true" /> Öffnen
                  </a>
                )}
                <button type="button" onClick={() => { setNote(null); setOpen(open === m.id ? null : m.id); }} className={btnQuiet} aria-expanded={open === m.id}>
                  <UserPlus size={14} aria-hidden="true" /> {m.companyId ? "Lesen & Kontakt übernehmen" : "Lesen & zuordnen"}
                </button>
                <button type="button" onClick={() => startTransition(() => taskFromMailAction(m.id))} className={btnQuiet}>
                  <CheckSquare size={14} aria-hidden="true" /> Aufgabe daraus
                </button>
                <Link href={`/vorgaenge/neu?mail=${m.id}`} className={btnQuiet}>
                  <FolderPlus size={14} aria-hidden="true" /> Vorgang daraus
                </Link>
                {m.status === "neu" && (
                  <>
                    <button type="button" onClick={() => ignore(m.id, open === m.id)} className={btnQuiet}>
                      <X size={14} aria-hidden="true" /> Ignorieren
                    </button>
                    <button
                      type="button"
                      onClick={() => startTransition(() => ignoreSenderAction(m.id))}
                      className={btnQuiet}
                      title={`Alle Mails von ${m.fromAddress?.split("@")[1]} künftig ignorieren (bei Gmail, GMX usw. nur diese Adresse)`}
                    >
                      <BellOff size={14} aria-hidden="true" /> Absender immer ignorieren
                    </button>
                  </>
                )}
              </div>
            </div>
            {open === m.id && (
              <MailContactPanel
                key={m.id}
                mailId={m.id}
                companies={companies}
                tagOptions={tagOptions}
                onClose={() => setOpen(null)}
                onSaved={() => next(m.id, "Zugeordnet.")}
                onIgnore={m.status === "neu" ? () => ignore(m.id, true) : undefined}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
