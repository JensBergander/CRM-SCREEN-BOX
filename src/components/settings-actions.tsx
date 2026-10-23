"use client";

import { useActionState, useState, useTransition } from "react";
import { saveAutoReplyAction, saveFolderTemplateAction, saveServiceTagsAction, sendDigestAction, syncLexwareAction } from "@/app/(app)/actions";
import { btnPrimary, btnQuiet, FormError, Input, Textarea } from "./ui";

export function AutoReplyForm({ settings, sent }: { settings: { enabled: boolean; domain: string; text: string; since: string | null }; sent: number }) {
  const [state, action, pending] = useActionState(saveAutoReplyAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 px-5 pb-5">
      <p className="text-sm text-muted">
        Schreibt jemand an eine Adresse dieser Domain, antwortet das CRM automatisch von office@ aus. Pro Absender höchstens einmal in
        30 Tagen, nicht an Newsletter, Systemabsender oder ignorierte Absender. Gilt nur für Mails, die nach dem Einschalten eingehen.
      </p>
      <label className="flex items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-5 w-5 accent-ink" />
        Automatische Antwort eingeschaltet
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
        Alte Domain
        <Input name="domain" defaultValue={settings.domain} required />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
        Antworttext
        <Textarea name="text" rows={11} defaultValue={settings.text} required />
      </label>
      {settings.enabled && settings.since && (
        <p className="text-xs text-muted">
          Aktiv seit {new Date(settings.since).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · bisher {sent} Antworten verschickt
        </p>
      )}
      <FormError message={state?.error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Speichern"}</button>
        {state && !state.error && !pending && <span className="text-sm text-muted">Gespeichert</span>}
      </div>
    </form>
  );
}

export function ServiceTagsForm({ tags, kind = "dienstleister" }: { tags: string[]; kind?: "dienstleister" | "lieferant" }) {
  const [state, action, pending] = useActionState(saveServiceTagsAction.bind(null, kind), undefined);
  const supplier = kind === "lieferant";
  return (
    <form action={action} className="flex flex-col gap-3 px-5 pb-5">
      <p className="text-sm text-muted">
        {supplier
          ? "Eine Kategorie pro Zeile, in der gewünschten Reihenfolge. Diese Auswahl erscheint als Pills bei Lieferanten. Entfernst du eine Kategorie, bleibt sie bei bereits zugeordneten Lieferanten stehen, bis du sie bearbeitest."
          : "Ein Gewerk pro Zeile, in der gewünschten Reihenfolge. Diese Auswahl erscheint als Pills bei Dienstleistern. Entfernst du ein Gewerk, bleibt es bei bereits zugeordneten Dienstleistern stehen, bis du sie bearbeitest."}
      </p>
      <label className="sr-only" htmlFor={`tags-${kind}`}>{supplier ? "Kategorien" : "Gewerke"}</label>
      <Textarea id={`tags-${kind}`} name="tags" rows={10} defaultValue={tags.join("\n")} />
      <FormError message={state?.error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : supplier ? "Kategorien speichern" : "Gewerke speichern"}</button>
        {state && !state.error && !pending && <span className="text-sm text-muted">Gespeichert</span>}
      </div>
    </form>
  );
}

export function FolderTemplateForm({ template }: { template: string }) {
  const [state, action, pending] = useActionState(saveFolderTemplateAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 px-5 pb-5">
      <p className="text-sm text-muted">
        Eine Zeile pro Ordner, Unterordner mit „/“. Gilt für neue Projektordner; bestehende Ordner werden nie verändert.
        Für den Knopf „Projektordner anlegen“ muss auf dem Mac der Helfer „CRM Ordner“ installiert sein
        (<code>tools/ordner-helfer/install.sh</code>).
      </p>
      <label className="sr-only" htmlFor="template">Ordnervorlage</label>
      <Textarea id="template" name="template" rows={14} defaultValue={template} className="font-mono text-[13px]" />
      <FormError message={state?.error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Vorlage speichern"}</button>
        {state && !state.error && !pending && <span className="text-sm text-muted">Gespeichert</span>}
      </div>
    </form>
  );
}

export function LexwareSyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ log: string[] } | { error: string } | null>(null);
  return (
    <div className="flex flex-col gap-2 px-5 pb-5">
      <div>
        <button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await syncLexwareAction()))} className={btnQuiet}>
          {pending ? "Gleicht ab …" : "Angebote und Rechnungen jetzt abgleichen"}
        </button>
      </div>
      {result && "error" in result && <FormError message={result.error} />}
      {result && "log" in result && (
        <div role="status" className="rounded-xl bg-bg px-4 py-3 text-sm">
          {result.log.length === 0 ? "Abgeglichen, keine Änderungen." : (
            <ul className="list-disc pl-4">{result.log.map((l) => <li key={l}>{l}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}

export function DigestButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ message: string } | { error: string } | null>(null);
  return (
    <div className="flex flex-col gap-2 px-5 pb-5">
      <p className="text-sm text-muted">
        Kommt jeden Montag ab 7 Uhr an office@, nur wenn etwas offen ist: nicht Abgerechnetes, unbezahlte Rechnungen, lange laufende
        Aufträge, Angebote ohne Rückmeldung, fällige Aufgaben und Mails ohne Zuordnung.
      </p>
      <div>
        <button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await sendDigestAction()))} className={btnQuiet}>
          {pending ? "Sendet …" : "Montags-Mail jetzt testweise senden"}
        </button>
      </div>
      {result && "error" in result && <FormError message={result.error} />}
      {result && "message" in result && <p role="status" className="text-sm">{result.message}</p>}
    </div>
  );
}
