"use client";

import { useState, useTransition } from "react";
import { Merge } from "lucide-react";
import { mergeCompanyAction } from "@/app/(app)/actions";
import { btnPrimary, btnQuiet, FormError, inputClass } from "./ui";

type Candidate = { id: number; name: string; lexwareId: string | null; number: string | null };

// Doppelte Firma in eine andere überführen; die mit Lexware-Nummer bleibt
export function MergeCompany({ company, candidates }: { company: Candidate | Omit<Candidate, "number">; candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(company.name);
  const [target, setTarget] = useState<Candidate | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <div className="border-t border-line-soft px-5 py-4">
        <button type="button" onClick={() => setOpen(true)} className={btnQuiet}>
          <Merge size={14} aria-hidden="true" /> Mit anderer Firma zusammenführen …
        </button>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const hits = needle ? candidates.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 8) : [];
  // Die Firma mit Lexware-Nummer bleibt, sonst die ausgewählte
  const keep = target && (company.lexwareId && !target.lexwareId ? company : target);
  const drop = target && (keep === target ? company : target);

  return (
    <section className="flex flex-col gap-3 border-t border-line-soft px-5 py-4">
      <h3 className="text-sm font-semibold">Mit anderer Firma zusammenführen</h3>
      {!target && (
        <>
          <label className="flex flex-col gap-1.5 text-sm">
            Welche Firma ist das doppelt?
            <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} autoFocus />
          </label>
          <ul className="flex flex-col gap-1">
            {hits.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setTarget(c)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-bg">
                  <span className="font-semibold">{c.name}</span>
                  {c.lexwareId && <span className="rounded-full bg-lexware-soft px-2 text-xs font-semibold text-lexware-ink">LX {c.number ?? ""}</span>}
                </button>
              </li>
            ))}
            {needle && !hits.length && <li className="px-3 text-sm text-muted">Keine passende Firma.</li>}
          </ul>
        </>
      )}
      {target && keep && drop && (
        <div className="flex flex-col gap-3 text-sm">
          {company.lexwareId && target.lexwareId ? (
            <FormError message="Beide Firmen sind mit Lexware verknüpft. Bitte zuerst in Lexware zusammenführen, dann hier." />
          ) : (
            <p>
              <strong>{drop.name}</strong> wird in <strong>{keep.name}</strong>
              {keep.lexwareId ? " (Lexware)" : ""} überführt: Ansprechpartner, Vorgänge, Mails, Notizen und Aufgaben wandern mit. Danach
              wird {drop.name} gelöscht.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!(company.lexwareId && target.lexwareId) && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => setError((await mergeCompanyAction(drop.id, keep.id))?.error))}
                className={btnPrimary}
              >
                {pending ? "Führt zusammen …" : "Zusammenführen"}
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => setTarget(null)} className={btnQuiet}>
              Andere wählen
            </button>
          </div>
        </div>
      )}
      {error && <FormError message={error} />}
      <div>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-muted hover:text-ink">
          Abbrechen
        </button>
      </div>
    </section>
  );
}
