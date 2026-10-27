"use client";

import { Fragment, useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addActivityAction,
  createContactAction,
  createTaskAction,
  moveDealAction,
  setCompetitorAction,
  updateCompanyAction,
  updateDealAction,
} from "@/app/(app)/actions";
import type { Company, CompanyKind, Deal, LostReason, Stage } from "@/db/schema";
import type { TagOptions } from "@/lib/service-tags";
import { STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { STAGE_TONE, TONE_SOFT } from "@/lib/tones";
import { LostDialog } from "./deal-board";
import { PlanningDialog } from "./planning";
import { AddressSearch } from "./place-input";
import { RunningDot } from "./timeline";
import { btnPrimary, btnQuiet, Field, FormError, Input, Textarea } from "./ui";

// Leert ein Formular nach erfolgreichem Absenden
export function useResetOnSuccess(state: { error?: string } | undefined, pending: boolean) {
  const ref = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) ref.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);
  return ref;
}

const FLOW: Stage[] = ["anfrage", "angebot", "beauftragt", "erledigt", "rechnung", "bezahlt"];

export function StageControl({ deal, competitors = [] }: { deal: Pick<Deal, "id" | "stage" | "title" | "compareOnly">; competitors?: string[] }) {
  const [pending, startTransition] = useTransition();
  const [lost, setLost] = useState(false);
  const [plan, setPlan] = useState(false);
  const go = (stage: Stage, l?: { reason: LostReason; note: string; competitor: string }) => {
    startTransition(() => moveDealAction(deal.id, stage, l));
    // Beim Beauftragen gleich die Produktion planen
    if (stage === "beauftragt") setPlan(true);
  };
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
                className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold ${
                  current ? `${TONE_SOFT[STAGE_TONE[stage]]} ring-1 ring-inset ring-current/25` : passed ? "bg-line-soft text-ink" : "bg-bg text-muted hover:text-ink"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]} ${current || passed ? "" : "opacity-40"}`} aria-hidden="true" />
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
      {plan && <PlanningDialog dealId={deal.id} title={deal.title} onClose={() => setPlan(false)} />}
      {lost && (
        <LostDialog
          deal={deal}
          onCancel={() => setLost(false)}
          competitors={competitors}
          onConfirm={(reason, note, competitor) => {
            setLost(false);
            go("verloren", { reason, note, competitor });
          }}
        />
      )}
    </div>
  );
}

// Wettbewerber eines verlorenen Vorgangs nachtragen oder ändern
export function CompetitorForm({ dealId, current, competitors }: { dealId: number; current: string | null; competitors: string[] }) {
  const [state, action, pending] = useActionState(setCompetitorAction.bind(null, dealId), undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-[13px] font-semibold text-muted">
        Wer hat den Auftrag bekommen?
        <Input name="competitor" defaultValue={current ?? ""} list={`competitors-${dealId}`} autoComplete="off" placeholder="noch unbekannt" />
      </label>
      <datalist id={`competitors-${dealId}`}>
        {competitors.map((c) => <option key={c} value={c} />)}
      </datalist>
      <button type="submit" disabled={pending} className={btnQuiet}>{pending ? "Speichert …" : "Speichern"}</button>
      {state && !state.error && !pending && <span className="text-sm text-muted">Gespeichert</span>}
    </form>
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

export function ActivityForm({ companyId, dealId, projects = [] }: {
  companyId: number | null;
  dealId: number | null;
  // aktive Projekte der Firma; die erste Pill ist vorausgewählt
  projects?: { id: number; title: string }[];
}) {
  const [state, action, pending] = useActionState(addActivityAction.bind(null, { companyId, dealId }), undefined);
  const ref = useResetOnSuccess(state, pending);
  const [target, setTarget] = useState<string>(projects[0] ? String(projects[0].id) : "");
  const pill = (on: boolean) =>
    `inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
      on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted"
    }`;
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2 px-5 pb-3 pt-1">
      <div className="flex flex-wrap items-start gap-2">
        <label className="min-w-0 flex-[1_1_260px]">
          <span className="sr-only">Notiz oder Anruf festhalten</span>
          <Textarea name="body" rows={1} placeholder="Notiz oder Anruf festhalten …" required className="min-h-10 resize-y py-2" />
        </label>
        <button type="submit" name="type" value="notiz" disabled={pending} className={btnQuiet}>Notiz</button>
        <button type="submit" name="type" value="anruf" disabled={pending} className={btnQuiet}>Anruf</button>
      </div>
      {!dealId && projects.length > 0 && (
        <div role="radiogroup" aria-label="Zuordnen zu" className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted">Zu:</span>
          {[...projects.map((p) => ({ value: String(p.id), label: p.title })), { value: "", label: "Nur Firma" }].map((o) => (
            <label key={o.value || "firma"} className={pill(target === o.value)}>
              <input type="radio" name="dealId" value={o.value} checked={target === o.value} onChange={() => setTarget(o.value)} className="sr-only" />
              {o.value && <RunningDot />}
              {o.label}
            </label>
          ))}
        </div>
      )}
      <FormError message={state?.error} />
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

// Art der Firma; bei Lieferanten die Kategorien als feste Auswahl (Pills, mehrere möglich)
const KIND_LABEL: Record<CompanyKind, string> = { kunde: "Kunde", lieferant: "Lieferant", wettbewerber: "Wettbewerber" };

export function KindFields({ kind = "kunde", tags, options, withCompetitor = false }: {
  kind?: CompanyKind;
  tags?: string | null;
  options: TagOptions;
  withCompetitor?: boolean;
}) {
  const [current, setCurrent] = useState(kind);
  const [selected, setSelected] = useState<string[]>((tags ?? "").split(",").map((t) => t.trim()).filter(Boolean));
  const toggle = (tag: string) => setSelected(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Art" className="flex w-fit rounded-full bg-line p-1">
        {(["kunde", "lieferant", ...(withCompetitor || kind === "wettbewerber" ? ["wettbewerber" as const] : [])] as CompanyKind[]).map((k) => (
          <label key={k} className={`inline-flex min-h-9 cursor-pointer items-center rounded-full px-4 text-[13px] font-semibold ${current === k ? "bg-surface shadow-sm" : "text-muted"}`}>
            <input type="radio" name="kind" value={k} checked={current === k} onChange={() => setCurrent(k)} className="sr-only" />
            {KIND_LABEL[k]}
          </label>
        ))}
      </div>
      {current === "lieferant" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-semibold text-muted">Kategorien</legend>
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
          <span className="text-xs text-muted">
            Die Auswahl pflegst du unter Einstellungen → Kategorien für Lieferanten.
          </span>
        </fieldset>
      )}
    </div>
  );
}

const LEXWARE_FIELDS: (keyof Company)[] = ["name", "street", "zip", "city", "phone", "email"];

export function EditCompanyForm({ company, tagOptions }: { company: Company; tagOptions: TagOptions }) {
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
  // Stammdaten von Lexware-Firmen kommen aus Lexware und werden dort gepflegt
  const fromLexware = !!company.lexwareId;
  const locked = (key: keyof Company) => fromLexware && LEXWARE_FIELDS.includes(key);
  return (
    <form action={action} className="grid gap-3 px-5 pb-5 pt-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sm:col-span-2 lg:col-span-4">
        <KindFields kind={company.kind} tags={company.tags} options={tagOptions} withCompetitor />
      </div>
      {fromLexware && (
        <p className="rounded-xl bg-lexware-soft px-4 py-3 text-sm text-lexware-ink sm:col-span-2 lg:col-span-4">
          Name, Adresse, Telefon und Mail kommen aus Lexware. Bitte dort ändern, dann „Aus Lexware aktualisieren“.
        </p>
      )}
      {fields.map(([key, label, hint]) => (
        <Fragment key={key}>
          {key === "street" && !fromLexware && (
            <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted sm:col-span-2 lg:col-span-4">
              Adresse suchen
              <AddressSearch />
            </div>
          )}
          <Field label={label} hint={hint}>
            <Input
              name={key}
              defaultValue={(company[key] as string | null) ?? ""}
              required={key === "name"}
              readOnly={locked(key)}
              className={locked(key) ? "bg-bg text-muted" : ""}
            />
          </Field>
        </Fragment>
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
