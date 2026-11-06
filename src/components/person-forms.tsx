"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Lock, Merge, Trash2, X } from "lucide-react";
import {
  addAffiliationAction,
  createPersonAction,
  deletePersonAction,
  findPeopleAction,
  mergePeopleAction,
  searchPeopleAction,
  updatePersonAction,
  type PersonMatch,
} from "@/app/(app)/actions";
import { btnPrimary, btnQuiet, Field, FormError, Input, inputClass, Textarea } from "./ui";

export type EditLink = {
  id: number;
  companyName: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  fromLexware: boolean;
  ended: boolean;
};
export type EditPerson = { id: number; firstName: string | null; lastName: string | null; mobile: string | null; notes: string | null };

const lockHint = "kommt aus Lexware, dort ändern";

function Locked({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
      <span className="inline-flex items-center gap-1.5">
        {label} <Lock size={12} aria-label={lockHint} />
      </span>
      <span className="flex min-h-11 items-center rounded-xl bg-bg px-3.5 text-[15px] font-normal text-ink" title={lockHint}>
        {value || "–"}
      </span>
    </div>
  );
}

// Fenster „Kontakt bearbeiten“: Person und je Firma die Zuordnung. Lexware-Felder sind gesperrt.
export function PersonEditor({ person, links, deletable }: { person: EditPerson; links: EditLink[]; deletable: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updatePersonAction.bind(null, person.id), undefined);
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string>();
  const submitted = useRef(false);
  const lexware = links.some((l) => l.fromLexware);

  useEffect(() => {
    if (submitted.current && !pending && state && !state.error) {
      submitted.current = false;
      setOpen(false);
    }
  }, [pending, state]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btnQuiet}>Bearbeiten</button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-label="Kontakt bearbeiten"
            onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          >
            <form
              action={action}
              onSubmit={() => (submitted.current = true)}
              className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-4 overflow-auto rounded-3xl bg-surface p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Kontakt bearbeiten</h2>
                  {lexware && <p className="text-sm text-muted">Name, Mail und Telefon kommen aus Lexware. Fehlt dort etwas, kannst du es hier ergänzen.</p>}
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="Schließen" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {lexware ? (
                  <>
                    <Locked label="Vorname" value={person.firstName} />
                    <Locked label="Nachname" value={person.lastName} />
                  </>
                ) : (
                  <>
                    <Field label="Vorname">
                      <Input name="firstName" defaultValue={person.firstName ?? ""} autoFocus />
                    </Field>
                    <Field label="Nachname" hint="Ein Name genügt, Vor- oder Nachname.">
                      <Input name="lastName" defaultValue={person.lastName ?? ""} />
                    </Field>
                  </>
                )}
                <Field label="Handy">
                  <Input name="mobile" type="tel" defaultValue={person.mobile ?? ""} />
                </Field>
              </div>
              <Field label="Notizen zur Person">
                <Textarea name="notes" rows={3} defaultValue={person.notes ?? ""} placeholder="z. B. bevorzugt Anrufe vormittags" />
              </Field>

              {links.map((l) => (
                <fieldset key={l.id} className="flex flex-col gap-3 rounded-2xl border border-line-soft p-4">
                  <legend className="px-1 text-sm font-semibold">{l.companyName ?? "Ohne Firma"}</legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Position">
                      <Input name={`c${l.id}_position`} defaultValue={l.position ?? ""} />
                    </Field>
                    {l.fromLexware && l.phone ? (
                      <Locked label="Festnetz" value={l.phone} />
                    ) : (
                      <Field label="Festnetz">
                        <Input name={`c${l.id}_phone`} type="tel" defaultValue={l.phone ?? ""} />
                      </Field>
                    )}
                    <div className="sm:col-span-2">
                      {l.fromLexware && l.email ? (
                        <Locked label="Mail" value={l.email} />
                      ) : (
                        <Field label="Mail">
                          <Input name={`c${l.id}_email`} type="email" defaultValue={l.email ?? ""} />
                        </Field>
                      )}
                    </div>
                  </div>
                  {l.companyName && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={`c${l.id}_ended`} defaultChecked={l.ended} className="h-4 w-4 accent-ink" />
                      Arbeitet nicht mehr dort (früher)
                    </label>
                  )}
                </fieldset>
              ))}

              <FormError message={state?.error ?? removeError} />
              <div className="flex flex-wrap items-center justify-end gap-2">
                {deletable && (
                  <button
                    type="button"
                    disabled={removing}
                    onClick={() => {
                      if (!window.confirm("Diesen Kontakt endgültig löschen?")) return;
                      startRemove(async () => {
                        const result = await deletePersonAction(person.id);
                        if (result?.error) setRemoveError(result.error);
                      });
                    }}
                    className={`${btnQuiet} mr-auto text-danger-ink`}
                  >
                    <Trash2 size={15} aria-hidden="true" /> Löschen
                  </button>
                )}
                <button type="submit" disabled={pending} className={btnPrimary}>
                  {pending ? "Speichert …" : "Speichern"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}

// „Weitere Firma zuordnen“: Firma wählen oder neu eintippen, dazu optional Position, Mail, Festnetz
export function AddAffiliation({ personId, companies }: { personId: number; companies: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addAffiliationAction.bind(null, personId), undefined);
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current && !pending && state && !state.error) {
      submitted.current = false;
      setOpen(false);
    }
  }, [pending, state]);

  if (!open) {
    return (
      <div className="border-t border-line-soft px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className={btnQuiet}>Weitere Firma zuordnen</button>
      </div>
    );
  }
  return (
    <form action={action} onSubmit={() => (submitted.current = true)} className="grid grid-cols-1 gap-3 border-t border-line-soft px-5 py-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label="Firma" hint="Aus der Liste wählen oder neuen Namen eingeben">
          <Input name="companyName" list={`affiliation-${personId}`} required autoFocus autoComplete="off" />
        </Field>
        <datalist id={`affiliation-${personId}`}>
          {companies.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </div>
      <Input name="position" placeholder="Position" aria-label="Position" />
      <Input name="phone" type="tel" placeholder="Festnetz" aria-label="Festnetz" />
      <Input name="email" type="email" placeholder="Mail bei dieser Firma" aria-label="Mail bei dieser Firma" className="sm:col-span-2" />
      <div className="flex items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={btnQuiet}>{pending ? "Speichert …" : "Zuordnen"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-muted">Abbrechen</button>
        <FormError message={state?.error} />
      </div>
    </form>
  );
}

// Neuer Kontakt von der Kontaktliste aus; Firma optional
export function NewPersonForm({ companies }: { companies: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(createPersonAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  const same = useSameName();
  return (
    <form ref={form} action={action} onBlur={(e) => ["firstName", "lastName"].includes((e.target as unknown as HTMLInputElement).name) && same.check(form.current)} className="flex max-w-xl flex-col gap-4 rounded-2xl bg-surface p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vorname">
          <Input name="firstName" autoFocus />
        </Field>
        <Field label="Nachname" hint="Ein Name genügt, Vor- oder Nachname.">
          <Input name="lastName" />
        </Field>
      </div>
      {same.matches.length > 0 && (
        <div className="rounded-xl bg-info-soft px-4 py-3 text-sm text-info-ink">
          <p className="font-semibold">Gibt es schon?</p>
          {same.matches.map((m) => (
            <p key={m.id}>
              <a href={`/kontakte/${m.id}`} className="font-semibold underline">{m.name}</a> · {m.firms}
            </p>
          ))}
          <p className="mt-1 text-xs">Ist es dieselbe Person, ordne ihr auf ihrer Kontaktseite eine weitere Firma zu. Sonst einfach weiter.</p>
        </div>
      )}
      <Field label="Firma" hint="Optional: aus der Liste wählen, neuen Namen eingeben oder leer lassen">
        <Input name="companyName" list="person-companies" autoComplete="off" />
      </Field>
      <datalist id="person-companies">
        {companies.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Position">
          <Input name="position" />
        </Field>
        <Field label="Mail">
          <Input name="email" type="email" />
        </Field>
        <Field label="Festnetz">
          <Input name="phone" type="tel" />
        </Field>
        <Field label="Handy">
          <Input name="mobile" type="tel" />
        </Field>
      </div>
      <FormError message={state?.error} />
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Wird angelegt …" : "Kontakt anlegen"}</button>
    </form>
  );
}

// Doppelte Person in diese überführen: Firmen, Notizen, Aufgaben, Vorgänge und Mails wandern mit
export function MergePerson({ person }: { person: { id: number; name: string } }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(person.name);
  const [hits, setHits] = useState<PersonMatch[]>([]);
  // wofür die angezeigten Treffer gelten; „Niemand gefunden“ erst, wenn die Suche für diese Eingabe fertig ist
  const [searched, setSearched] = useState("");
  const [target, setTarget] = useState<PersonMatch | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(
      () =>
        searchPeopleAction(query, person.id).then((rows) => {
          setHits(rows);
          setSearched(query);
        }),
      250,
    );
    return () => clearTimeout(t);
  }, [open, query, person.id]);

  if (!open) {
    return (
      <div className="border-t border-line-soft px-5 py-4">
        <button type="button" onClick={() => setOpen(true)} className={btnQuiet}>
          <Merge size={14} aria-hidden="true" /> Mit anderer Person zusammenführen …
        </button>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-3 border-t border-line-soft px-5 py-4">
      <h3 className="text-sm font-semibold">Mit anderer Person zusammenführen</h3>
      {!target ? (
        <>
          <label className="flex flex-col gap-1.5 text-sm">
            Wer ist das doppelt?
            <input value={query} onChange={(e) => setQuery(e.target.value)} className={inputClass} autoFocus />
          </label>
          <ul className="flex flex-col gap-1">
            {hits.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setTarget(p)} className="flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm hover:bg-bg">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs text-muted">{p.firms}</span>
                </button>
              </li>
            ))}
            {query.trim() && searched === query && !hits.length && <li className="px-3 text-sm text-muted">Niemand gefunden.</li>}
          </ul>
        </>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <strong>{target.name}</strong> ({target.firms}) wird in <strong>{person.name}</strong> überführt: Firmen, Notizen, Anrufe, Aufgaben, Vorgänge und
            Mails wandern mit. Danach gibt es {target.name} nicht mehr als eigenen Kontakt.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(async () => setError((await mergePeopleAction(target.id, person.id))?.error))}
              className={btnPrimary}
            >
              {pending ? "Führt zusammen …" : "Zusammenführen"}
            </button>
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

// Hinweis „gibt es schon“ beim Anlegen: prüft nach Eingabe des Namens auf gleichnamige Personen
export function useSameName(companyId?: number | null) {
  const [matches, setMatches] = useState<PersonMatch[]>([]);
  const check = (form: HTMLFormElement | null) => {
    if (!form) return;
    const data = new FormData(form);
    findPeopleAction(String(data.get("firstName") ?? ""), String(data.get("lastName") ?? ""), companyId).then(setMatches);
  };
  return { matches, check, clear: () => setMatches([]) };
}
