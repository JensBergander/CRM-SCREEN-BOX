"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { createInLexwareAction, linkLexwareAction, refreshFromLexwareAction, searchLexwareAction } from "@/app/(app)/actions";
import type { LexwareHit } from "@/lib/lexware";
import { btnPrimary, btnQuiet, FormError, Input } from "./ui";

type Target = { id: number; name: string; kind: string; lexwareId: string | null };

// Auf der Firmenseite: verknüpfte Firmen sofort neu laden, alle anderen verknüpfen oder in Lexware anlegen
export function LexwareActions({ company, personGuess }: { company: Target; personGuess: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [dialog, setDialog] = useState<"link" | "create" | null>(null);

  if (company.lexwareId) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(async () => setError((await refreshFromLexwareAction(company.id)).error))}
          className={btnQuiet}
        >
          <RefreshCw size={14} aria-hidden="true" className={pending ? "animate-spin" : ""} />
          {pending ? "Lädt …" : "Aus Lexware aktualisieren"}
        </button>
        <FormError message={error} />
      </div>
    );
  }
  if (company.kind === "wettbewerber") return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setDialog("link")} className={btnQuiet}>Mit Lexware verknüpfen</button>
        <button type="button" onClick={() => setDialog("create")} className={btnQuiet}>In Lexware anlegen</button>
      </div>
      {dialog === "link" && <LinkDialog company={company} onClose={() => setDialog(null)} />}
      {dialog === "create" && <CreateDialog company={company} personGuess={personGuess} onClose={() => setDialog(null)} />}
    </>
  );
}

function Dialog({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-3xl bg-surface p-6">{children}</div>
    </div>
  );
}

function LinkDialog({ company, onClose }: { company: Target; onClose: () => void }) {
  const [query, setQuery] = useState(company.name);
  const [hits, setHits] = useState<LexwareHit[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const search = () =>
    startTransition(async () => {
      const result = await searchLexwareAction(query);
      if ("error" in result) setError(result.error);
      else {
        setError(undefined);
        setHits(result);
      }
    });
  const link = (hit: LexwareHit) =>
    startTransition(async () => {
      const result = await linkLexwareAction(company.id, hit.id);
      if (result.error) setError(result.error);
      else onClose();
    });

  return (
    <Dialog label="Mit Lexware verknüpfen">
      <h2 className="text-lg font-bold">„{company.name}“ mit Lexware verknüpfen</h2>
      <p className="text-sm text-muted">
        Danach kommen Name, Adresse, Nummern, Telefon, Mail und Ansprechpartner aus Lexware.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Name in Lexware" placeholder="mindestens 3 Zeichen" />
        <button type="submit" disabled={pending || query.trim().length < 3} className={btnQuiet}>Suchen</button>
      </form>
      {hits && hits.length === 0 && <p className="text-sm text-muted">Nichts gefunden, das noch nicht verknüpft ist.</p>}
      {hits && hits.length > 0 && (
        <ul className="flex flex-col">
          {hits.map((h) => (
            <li key={h.id} className="flex items-center gap-3 border-t border-line-soft py-2.5">
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate font-semibold">{h.name}</p>
                <p className="text-xs text-muted">{[h.number && `Nr. ${h.number}`, h.city, h.archived && "archiviert"].filter(Boolean).join(" · ") || "–"}</p>
              </div>
              <button type="button" disabled={pending} onClick={() => link(h)} className={btnQuiet}>Verknüpfen</button>
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={btnQuiet}>Schließen</button>
      </div>
    </Dialog>
  );
}

function CreateDialog({ company, personGuess, onClose }: { company: Target; personGuess: boolean; onClose: () => void }) {
  const [customer, setCustomer] = useState(company.kind === "kunde");
  const [vendor, setVendor] = useState(company.kind !== "kunde");
  const [person, setPerson] = useState(personGuess);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const check = "h-5 w-5 accent-ink";

  return (
    <Dialog label="In Lexware anlegen">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await createInLexwareAction(company.id, { customer, vendor, person });
            if (result.error) setError(result.error);
            else onClose();
          });
        }}
      >
        <h2 className="text-lg font-bold">„{company.name}“ in Lexware anlegen</h2>
        <p className="text-sm text-muted">
          Legt den Kontakt mit Name, Adresse, Mail, Telefon und Ansprechpartnern in Lexware an und verknüpft ihn. Danach pflegst du
          diese Daten in Lexware.
        </p>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 text-[13px] font-semibold text-muted">Rolle in Lexware</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={customer} onChange={(e) => setCustomer(e.target.checked)} className={check} /> Kunde</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={vendor} onChange={(e) => setVendor(e.target.checked)} className={check} /> Lieferant</label>
        </fieldset>
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 text-[13px] font-semibold text-muted">Art</legend>
          <label className="flex items-center gap-2"><input type="radio" name="art" checked={!person} onChange={() => setPerson(false)} className={check} /> Firma (mit Ansprechpartnern)</label>
          <label className="flex items-center gap-2"><input type="radio" name="art" checked={person} onChange={() => setPerson(true)} className={check} /> Person</label>
        </fieldset>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnQuiet}>Abbrechen</button>
          <button type="submit" disabled={pending || (!customer && !vendor)} className={btnPrimary}>
            {pending ? "Legt an …" : "In Lexware anlegen"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
