"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Lock, Trash2, X } from "lucide-react";
import { addAffiliationAction, createPersonAction, deletePersonAction, updatePersonAction } from "@/app/(app)/actions";
import { btnPrimary, btnQuiet, Field, FormError, Input, Textarea } from "./ui";

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
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4 rounded-2xl bg-surface p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vorname">
          <Input name="firstName" autoFocus />
        </Field>
        <Field label="Nachname" hint="Ein Name genügt, Vor- oder Nachname.">
          <Input name="lastName" />
        </Field>
      </div>
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
