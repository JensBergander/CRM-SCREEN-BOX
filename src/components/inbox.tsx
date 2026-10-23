"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { BellOff, CheckSquare, ExternalLink, FolderPlus, Paperclip, RefreshCw, UserPlus, X } from "lucide-react";
import {
  createContactFromMailAction,
  ignoreMailAction,
  ignoreSenderAction,
  loadMailForContactAction,
  syncMailAction,
  taskFromMailAction,
  type MailForContact,
} from "@/app/(app)/actions";
import { relativeTime } from "@/lib/format";
import type { InboxRow } from "@/lib/queries";
import type { SyncResult } from "@/lib/mail";
import { KindFields } from "./forms";
import { RunningDot } from "./timeline";
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

// Laufende Projekte der erkannten Firma; das erste ist vorausgewählt
function ProjectPicker({ projects, companyName }: { projects: { id: number; title: string }[]; companyName: string }) {
  const [target, setTarget] = useState(String(projects[0].id));
  const pill = (on: boolean) =>
    `inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
      on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted"
    }`;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-[13px] font-semibold text-muted">Projekt bei {companyName}</legend>
      <div role="radiogroup" className="flex flex-wrap gap-1.5">
        {[...projects.map((p) => ({ value: String(p.id), label: p.title })), { value: "", label: "Nur Firma" }].map((o) => (
          <label key={o.value || "firma"} className={pill(target === o.value)}>
            <input type="radio" name="dealId" value={o.value} checked={target === o.value} onChange={() => setTarget(o.value)} className="sr-only" />
            {o.value && <RunningDot />}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Mail im Volltext lesen und Absender mit den Daten aus der Signatur übernehmen
function MailPanel({ row, companies, tagOptions, onClose }: { row: InboxRow; companies: { id: number; name: string }[]; tagOptions: string[]; onClose: () => void }) {
  const [data, setData] = useState<MailForContact | { error: string } | null>(null);
  const [state, action, pending] = useActionState(createContactFromMailAction.bind(null, row.mail.id), undefined);
  const [, startLoading] = useTransition();
  useEffect(() => {
    startLoading(async () => setData(await loadMailForContactAction(row.mail.id)));
  }, [row.mail.id]);

  if (!data) return <p className="mt-3 rounded-xl bg-bg p-4 text-sm text-muted">Mail wird geladen und Signatur ausgelesen …</p>;
  if ("error" in data) return <div className="mt-3"><FormError message={data.error} /></div>;
  if (state && !state.error && !pending) {
    return (
      <p role="status" className="mt-3 flex items-center gap-3 rounded-xl bg-bg p-4 text-sm">
        Übernommen und zugeordnet.
        <button type="button" onClick={onClose} className={btnQuiet}>Schließen</button>
      </p>
    );
  }
  const s = data.suggestion;
  const domain = s.email.split("@")[1];
  return (
    <div className="mt-3 grid gap-4 rounded-xl bg-bg p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Mailtext" className="max-h-[560px] overflow-auto rounded-lg bg-surface p-4 text-[13px] leading-relaxed whitespace-pre-wrap">
        {data.text || "(kein Text)"}
      </section>
      <form action={action} className="flex flex-col gap-3">
        <p className="text-xs text-muted">Aus der Signatur vorausgefüllt, bitte kurz prüfen.</p>
        <KindFields options={tagOptions} />
        <Field label="Firma oder Person" hint="Vorhandene wählen oder neuen Namen eingeben">
          <Input name="companyName" list={`companies-${row.mail.id}`} required autoComplete="off" defaultValue={data.company?.name ?? s.company} />
        </Field>
        <datalist id={`companies-${row.mail.id}`}>
          {companies.map((c) => <option key={c.id} value={c.name} />)}
        </datalist>
        {data.projects.length > 0 && <ProjectPicker projects={data.projects} companyName={data.company?.name ?? ""} />}
        <div className="grid grid-cols-2 gap-2">
          <Input name="firstName" aria-label="Vorname" placeholder="Vorname" defaultValue={s.firstName} />
          <Input name="lastName" aria-label="Nachname" placeholder="Nachname" defaultValue={s.lastName} required />
        </div>
        <Input name="position" aria-label="Position" placeholder="Position / Tätigkeit" defaultValue={s.position} />
        <Input name="email" type="email" aria-label="E-Mail" placeholder="E-Mail" defaultValue={s.email} />
        <div className="grid grid-cols-2 gap-2">
          <Input name="phone" aria-label="Telefon" placeholder="Telefon" defaultValue={s.phone} />
          <Input name="mobile" aria-label="Mobil" placeholder="Mobil" defaultValue={s.mobile} />
        </div>
        <Input name="website" aria-label="Website" placeholder="Website" defaultValue={s.website} />
        <Input name="street" aria-label="Straße" placeholder="Straße" defaultValue={s.street} />
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Input name="zip" aria-label="PLZ" placeholder="PLZ" defaultValue={s.zip} />
          <Input name="city" aria-label="Ort" placeholder="Ort" defaultValue={s.city} />
        </div>
        {domain && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="learnDomain" defaultChecked className="h-5 w-5 accent-ink" />
            Künftig alle Mails von @{domain} hier zuordnen
          </label>
        )}
        <FormError message={state?.error} />
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Übernehmen"}</button>
          <button type="button" onClick={onClose} className={btnQuiet}>Schließen</button>
        </div>
      </form>
    </div>
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
                <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className={btnQuiet} aria-expanded={open === m.id}>
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
            {open === m.id && <MailPanel row={row} companies={companies} tagOptions={tagOptions} onClose={() => setOpen(null)} />}
          </li>
        );
      })}
    </ul>
  );
}
