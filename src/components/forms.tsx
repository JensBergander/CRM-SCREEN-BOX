"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addActivityAction,
  createContactAction,
  createTaskAction,
  moveDealAction,
  updateCompanyAction,
  updateDealAction,
} from "@/app/(app)/actions";
import type { Company, Deal, LostReason, Stage } from "@/db/schema";
import { STAGE_LABEL } from "@/lib/labels";
import { LostDialog } from "./deal-board";
import { btnPrimary, btnQuiet, Field, FormError, Input, Textarea } from "./ui";

// Leert ein Formular nach erfolgreichem Absenden
function useResetOnSuccess(state: { error?: string } | undefined, pending: boolean) {
  const ref = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) ref.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);
  return ref;
}

const FLOW: Stage[] = ["anfrage", "angebot", "beauftragt", "erledigt", "rechnung", "bezahlt"];

export function StageControl({ deal }: { deal: Pick<Deal, "id" | "stage" | "title" | "compareOnly"> }) {
  const [pending, startTransition] = useTransition();
  const [lost, setLost] = useState(false);
  const go = (stage: Stage, l?: { reason: LostReason; note: string }) =>
    startTransition(() => moveDealAction(deal.id, stage, l));
  const index = FLOW.indexOf(deal.stage);
  const next = index >= 0 && index < FLOW.length - 1 ? FLOW[index + 1] : null;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap gap-1.5" aria-label="Phasen">
        {FLOW.map((stage, i) => {
          const current = stage === deal.stage;
          const passed = index >= 0 && i < index;
          return (
            <li key={stage}>
              <button
                type="button"
                disabled={pending || current}
                onClick={() => go(stage)}
                aria-current={current ? "step" : undefined}
                className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold ${
                  current ? "bg-ink text-surface" : passed ? "bg-line text-ink" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                {STAGE_LABEL[stage]}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-2">
        {next && (
          <button type="button" disabled={pending} onClick={() => go(next)} className={btnPrimary}>
            Weiter: {STAGE_LABEL[next]}
          </button>
        )}
        {deal.stage !== "verloren" && deal.stage !== "bezahlt" && (
          <button type="button" disabled={pending} onClick={() => setLost(true)} className={btnQuiet}>
            Als verloren markieren
          </button>
        )}
      </div>
      {lost && (
        <LostDialog
          deal={deal}
          onCancel={() => setLost(false)}
          onConfirm={(reason, note) => {
            setLost(false);
            go("verloren", { reason, note });
          }}
        />
      )}
    </div>
  );
}

export function EditDealForm({ deal }: { deal: Deal }) {
  const [state, action, pending] = useActionState(updateDealAction.bind(null, deal.id), undefined);
  return (
    <form action={action} className="flex flex-col gap-4 px-5 pb-5 pt-2">
      <Field label="Vorgang">
        <Input name="title" defaultValue={deal.title} required />
      </Field>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <Field label="Betrag netto (€)">
          <Input name="amountNet" inputMode="decimal" defaultValue={deal.amountNet?.replace(".", ",") ?? ""} />
        </Field>
        <Field label="Projektdatum">
          <Input name="projectDate" type="date" defaultValue={deal.projectDate ?? ""} />
        </Field>
        <Field label="Angebotsnr. (Lexware)">
          <Input name="offerNumber" defaultValue={deal.offerNumber ?? ""} />
        </Field>
        <Field label="Rechnungsnr. (Lexware)">
          <Input name="invoiceNumber" defaultValue={deal.invoiceNumber ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="compareOnly" defaultChecked={deal.compareOnly} className="h-5 w-5 accent-ink" />
        Vermutlich nur Vergleichsangebot
      </label>
      <Field label="Notiz">
        <Textarea name="notes" defaultValue={deal.notes ?? ""} />
      </Field>
      <FormError message={state?.error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Speichern"}</button>
        {state && !state.error && !pending && <span className="text-sm text-muted">Gespeichert</span>}
      </div>
    </form>
  );
}

export function ActivityForm({ companyId, dealId }: { companyId: number | null; dealId: number | null }) {
  const [state, action, pending] = useActionState(addActivityAction.bind(null, { companyId, dealId }), undefined);
  const ref = useResetOnSuccess(state, pending);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-3 px-5 pb-4 pt-1">
      <Textarea name="body" rows={2} placeholder="Notiz oder Anruf festhalten, z. B. „Herr X will Fotos vom Lager“" required />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="type" value="notiz" disabled={pending} className={btnQuiet}>Als Notiz</button>
        <button type="submit" name="type" value="anruf" disabled={pending} className={btnQuiet}>Als Anruf</button>
        <FormError message={state?.error} />
      </div>
    </form>
  );
}

export function TaskForm({ companyId, dealId }: { companyId?: number | null; dealId?: number | null }) {
  const [state, action, pending] = useActionState(createTaskAction, undefined);
  const ref = useResetOnSuccess(state, pending);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-2 border-t border-line-soft px-5 py-3.5">
      {companyId && <input type="hidden" name="companyId" value={companyId} />}
      {dealId && <input type="hidden" name="dealId" value={dealId} />}
      <label className="min-w-0 flex-[1_1_220px]">
        <span className="sr-only">Neue Aufgabe</span>
        <Input name="title" placeholder="Neue Aufgabe" required />
      </label>
      <label>
        <span className="sr-only">Fällig am</span>
        <Input name="dueDate" type="date" className="w-auto" />
      </label>
      <button type="submit" disabled={pending} className={btnQuiet}>Hinzufügen</button>
      <FormError message={state?.error} />
    </form>
  );
}

export function ContactForm({ companyId }: { companyId: number }) {
  const [state, action, pending] = useActionState(createContactAction.bind(null, companyId), undefined);
  const ref = useResetOnSuccess(state, pending);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="border-t border-line-soft px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className={btnQuiet}>Kontakt hinzufügen</button>
      </div>
    );
  }
  return (
    <form ref={ref} action={action} className="grid grid-cols-2 gap-3 border-t border-line-soft px-5 py-4">
      <Input name="firstName" placeholder="Vorname" aria-label="Vorname" />
      <Input name="lastName" placeholder="Nachname" aria-label="Nachname" required />
      <Input name="email" type="email" placeholder="E-Mail" aria-label="E-Mail" className="col-span-2" />
      <Input name="phone" placeholder="Telefon" aria-label="Telefon" />
      <Input name="mobile" placeholder="Mobil" aria-label="Mobil" />
      <Input name="position" placeholder="Position" aria-label="Position" className="col-span-2" />
      <div className="col-span-2 flex items-center gap-2">
        <button type="submit" disabled={pending} className={btnQuiet}>Speichern</button>
        <button type="button" onClick={() => setOpen(false)} className="text-[13px] text-muted">Schließen</button>
        <FormError message={state?.error} />
      </div>
    </form>
  );
}

// Kunde oder Dienstleister; bei Dienstleistern die Gewerke als feste Auswahl (Pills, mehrere möglich)
export function KindFields({ kind = "kunde", tags, options }: { kind?: "kunde" | "dienstleister"; tags?: string | null; options: string[] }) {
  const [current, setCurrent] = useState(kind);
  const [selected, setSelected] = useState<string[]>((tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const toggle = (tag: string) => setSelected(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Art" className="flex w-fit rounded-full bg-line p-1">
        {(["kunde", "dienstleister"] as const).map((k) => (
          <label key={k} className={`inline-flex min-h-9 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold ${current === k ? "bg-surface shadow-sm" : "text-muted"}`}>
            <input type="radio" name="kind" value={k} checked={current === k} onChange={() => setCurrent(k)} className="sr-only" />
            {k === "kunde" ? "Kunde" : "Dienstleister"}
          </label>
        ))}
      </div>
      {current === "dienstleister" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-semibold text-muted">Gewerke</legend>
          <div className="flex flex-wrap gap-2">
            {options.map((tag) => {
              const on = selected.includes(tag);
              return (
                <label
                  key={tag}
                  className={`inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
                    on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-ink"
                  }`}
                >
                  <input type="checkbox" name="tags" value={tag} checked={on} onChange={() => toggle(tag)} className="sr-only" />
                  {tag}
                </label>
              );
            })}
          </div>
          <span className="text-xs text-muted">Die Auswahl pflegst du unter Einstellungen → Gewerke.</span>
        </fieldset>
      )}
    </div>
  );
}

export function EditCompanyForm({ company, tagOptions }: { company: Company; tagOptions: string[] }) {
  const [state, action, pending] = useActionState(updateCompanyAction.bind(null, company.id), undefined);
  const fields: [keyof Company, string, string?][] = [
    ["name", "Name"],
    ["folderName", "Ordnername", "für die Projektordner, z. B. EUROWINGS"],
    ["street", "Straße"],
    ["zip", "PLZ"],
    ["city", "Ort"],
    ["phone", "Telefon (Zentrale)"],
    ["email", "E-Mail (allgemein)"],
    ["website", "Website"],
    ["emailDomain", "Mail-Domain", "z. B. eurowings.com, für die Zuordnung der Mails"],
    ["industry", "Branche"],
  ];
  return (
    <form action={action} className="grid gap-3 px-5 pb-5 pt-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4">
        <KindFields kind={company.kind} tags={company.tags} options={tagOptions} />
      </div>
      {fields.map(([key, label, hint]) => (
        <Field key={key} label={label} hint={hint}>
          <Input name={key} defaultValue={(company[key] as string | null) ?? ""} required={key === "name"} />
        </Field>
      ))}
      <div className="sm:col-span-2 lg:col-span-4">
        <Field label="Notiz">
          <Textarea name="notes" defaultValue={company.notes ?? ""} />
        </Field>
      </div>
      <FormError message={state?.error} />
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Speichern"}</button>
        {state && !state.error && !pending && <span className="text-sm text-muted">Gespeichert</span>}
      </div>
    </form>
  );
}
