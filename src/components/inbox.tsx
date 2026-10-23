"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { BellOff, CheckSquare, ExternalLink, FolderPlus, Link2, Paperclip, RefreshCw, X } from "lucide-react";
import { assignMailAction, ignoreMailAction, ignoreSenderAction, syncMailAction, taskFromMailAction } from "@/app/(app)/actions";
import { relativeTime } from "@/lib/format";
import type { InboxRow } from "@/lib/queries";
import type { SyncResult } from "@/lib/mail";
import { KindFields } from "./forms";
import { btnPrimary, btnQuiet, Empty, Field, FormError, Input } from "./ui";

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

function AssignForm({ row, companies, tagOptions, onClose }: { row: InboxRow; companies: { id: number; name: string }[]; tagOptions: string[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(assignMailAction.bind(null, row.mail.id), undefined);
  const domain = row.mail.fromAddress?.split("@")[1];
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 rounded-xl bg-bg p-4">
      <KindFields options={tagOptions} />
      <Field label="Firma oder Person" hint="Vorhandene wählen oder neuen Namen eingeben; Art und Gewerk gelten nur für neue">

        <Input name="companyName" list="inbox-companies" required autoFocus autoComplete="off" placeholder="Firma wählen oder neu eingeben" />
      </Field>
      <datalist id="inbox-companies">
        {companies.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="createContact" defaultChecked className="h-5 w-5 accent-ink" />
        Absender als Kontakt anlegen
      </label>
      {domain && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="learnDomain" defaultChecked className="h-5 w-5 accent-ink" />
          Künftig alle Mails von @{domain} dieser Firma zuordnen
        </label>
      )}
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Zuordnen"}</button>
        <button type="button" onClick={onClose} className={btnQuiet}>Abbrechen</button>
      </div>
    </form>
  );
}

export function InboxList({ rows, companies, tagOptions }: { rows: InboxRow[]; companies: { id: number; name: string }[]; tagOptions: string[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  if (!rows.length) return <Empty>Keine Mails in dieser Ansicht.</Empty>;

  return (
    <ul>
      {rows.map((row) => {
        const m = row.mail;
        return (
          <li key={m.id} className="border-t border-line-soft px-5 py-4">
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
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.webLink && (
                  <a href={m.webLink} target="_blank" rel="noreferrer" className={btnQuiet} aria-label="In Outlook öffnen">
                    <ExternalLink size={14} aria-hidden="true" /> Öffnen
                  </a>
                )}
                {!m.companyId && (
                  <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className={btnQuiet}>
                    <Link2 size={14} aria-hidden="true" /> Zuordnen
                  </button>
                )}
                <button type="button" onClick={() => startTransition(() => taskFromMailAction(m.id))} className={btnQuiet}>
                  <CheckSquare size={14} aria-hidden="true" /> Aufgabe daraus
                </button>
                <Link href={`/vorgaenge/neu?mail=${m.id}`} className={btnQuiet}>
                  <FolderPlus size={14} aria-hidden="true" /> Vorgang daraus
                </Link>
                {m.status === "neu" && (
                  <>
                    <button type="button" onClick={() => startTransition(() => ignoreMailAction(m.id))} className={btnQuiet}>
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
            {open === m.id && <AssignForm row={row} companies={companies} tagOptions={tagOptions} onClose={() => setOpen(null)} />}
          </li>
        );
      })}
    </ul>
  );
}
