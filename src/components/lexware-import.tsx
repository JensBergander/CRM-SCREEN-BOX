"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissDuplicateAction, importLexwareAction, linkLexwareAction } from "@/app/(app)/actions";
import type { Duplicate, LexwareSyncResult } from "@/lib/lexware";
import { btnPrimary, btnQuiet, FormError } from "./ui";

export function LexwareImport({ configured, lastSync }: { configured: boolean; lastSync: string | null }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LexwareSyncResult | { error: string } | null>(null);

  return (
    <div className="flex flex-col gap-4 px-5 pb-5 pt-1">
      <p className="text-sm text-muted">
        Lexware ist das Maß der Dinge: Name, Adresse, Nummern, Telefon, Mail und Ansprechpartner kommen von dort und sind im
        CRM gesperrt. Was es nur im CRM gibt (Notizen, Ordnername, Bewertung, Gewerke, Mail-Domain, Firmenart), bleibt
        erhalten. Der Abgleich läuft jeden Morgen automatisch{lastSync && `, zuletzt am ${lastSync.split("-").reverse().join(".")}`}.
        Archivierte Lexware-Kontakte bleiben im CRM und werden markiert.
      </p>
      {!configured && <FormError message="Der Lexware-Schlüssel (LEXWARE_API_KEY) ist auf dem Server noch nicht hinterlegt." />}
      <div>
        <button
          type="button"
          disabled={pending || !configured}
          onClick={() => startTransition(async () => setResult(await importLexwareAction()))}
          className={btnPrimary}
        >
          {pending ? "Gleicht ab …" : "Jetzt mit Lexware abgleichen"}
        </button>
      </div>
      {result && "error" in result && <FormError message={result.error} />}
      {result && !("error" in result) && (
        <p role="status" className="rounded-xl bg-bg px-4 py-3 text-sm">
          {result.created} Firmen neu, {result.linked} mit vorhandenen verknüpft, {result.updated} aktualisiert,{" "}
          {result.contacts} Ansprechpartner neu
          {result.archived > 0 && `, ${result.archived} in Lexware archiviert`}
          {result.duplicates > 0 && `, ${result.duplicates} mögliche Dubletten (siehe unten)`}.
        </p>
      )}
    </div>
  );
}

// Lexware-Kontakte, die einer CRM-Firma ohne Lexware ähneln; werden erst angelegt, wenn du entscheidest
export function DuplicateList({ items }: { items: Duplicate[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => setError((await fn()).error));

  return (
    <ul className="flex flex-col">
      {items.map((d) => (
        <li key={`${d.lexwareId}-${d.companyId}`} className="flex flex-wrap items-center gap-3 border-t border-line-soft px-5 py-3.5">
          <div className="min-w-0 flex-[1_1_280px] text-sm">
            <p>
              <span className="font-semibold">{d.lexwareName}</span>
              <span className="text-muted"> in Lexware{d.number && ` (Nr. ${d.number})`}</span>
            </p>
            <p className="text-muted">
              ähnelt <Link href={`/firmen/${d.companyId}`} className="font-semibold text-ink hover:underline">{d.companyName}</Link> im CRM
            </p>
          </div>
          <button type="button" disabled={pending} onClick={() => run(() => linkLexwareAction(d.companyId, d.lexwareId))} className={btnQuiet}>
            Verknüpfen
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => dismissDuplicateAction(d.lexwareId, d.companyId))} className={btnQuiet}>
            Sind verschieden
          </button>
        </li>
      ))}
      {error && <li className="px-5 pb-3"><FormError message={error} /></li>}
    </ul>
  );
}
