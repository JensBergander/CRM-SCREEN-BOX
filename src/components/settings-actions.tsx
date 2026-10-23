"use client";

import { useState, useTransition } from "react";
import { sendDigestAction, syncLexwareAction } from "@/app/(app)/actions";
import { btnQuiet, FormError } from "./ui";

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
