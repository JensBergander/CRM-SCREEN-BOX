"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { createContactFromMailAction, loadMailForContactAction, type MailForContact } from "@/app/(app)/actions";
import type { TagOptions } from "@/lib/service-tags";
import { AddressSearch } from "./place-input";
import { KindFields } from "./forms";
import { RatingHintView } from "./rating";
import { btnPrimary, btnQuiet, Field, FormError, Input, LexwareBadge, RunningDot, Select } from "./ui";

// Laufende Projekte der erkannten Firma; das erste ist vorausgewählt
function ProjectPicker({ projects, companyName, preset }: { projects: { id: number; title: string; company?: string }[]; companyName: string; preset?: null }) {
  // Lieferanten: laufende Projekte aller Kunden als Auswahlliste, vorausgewählt „Nur Firma“
  const foreign = projects.some((p) => p.company);
  // preset null: „Nur Firma“ vorausgewählt (Zeitleiste), sonst das erste laufende Projekt
  const initial = preset === null || foreign ? "" : String(projects[0].id);
  const [target, setTarget] = useState(initial);
  const pill = (on: boolean) =>
    `inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
      on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted"
    }`;
  if (foreign || projects.length > 4) {
    return (
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
        {foreign ? "Zu einem Kundenprojekt?" : `Projekt bei ${companyName}`}
        <Select name="dealId" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Nur {foreign ? "Lieferant" : "Firma"}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.company ? `${p.company} · ${p.title}` : p.title}</option>
          ))}
        </Select>
      </label>
    );
  }
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

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Ein Feld im Abgleich: gespeichert links, aus der Signatur zum Übernehmen rechts.
// Leer gespeichert → vorab angehakt; abweichend → nicht angehakt; gleich → nur Anzeige; Lexware → gesperrt
function CompareRow({ name, label, saved, suggested, locked, type }: { name: string; label: string; saved: string | null; suggested: string; locked?: boolean; type?: string }) {
  const [checked, setChecked] = useState(!saved);
  const ref = useRef<HTMLInputElement>(null);
  // Eingabe (auch aus der Adresssuche, die Werte direkt setzt) hakt das Feld an
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setChecked(true);
    el.addEventListener("input", on);
    return () => el.removeEventListener("input", on);
  }, []);

  if (saved && (locked || !suggested || norm(saved) === norm(suggested))) {
    return (
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-2 text-[13px]">
        <span className="font-semibold text-muted">{label}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{saved}</span>
          {locked ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-lexware-soft px-1.5 py-0.5 text-[11px] font-semibold text-lexware-ink">
              <Lock size={10} aria-hidden="true" /> Lexware
            </span>
          ) : suggested ? (
            <span className="shrink-0 text-[11px] text-muted">gleich</span>
          ) : null}
        </span>
        {locked && suggested && norm(saved) !== norm(suggested) && (
          <span className="col-start-2 -mt-1 text-xs text-muted">Signatur: {suggested} (bei Bedarf in Lexware ändern)</span>
        )}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2 text-[13px]">
      <label className="mt-2.5 flex items-center gap-1.5 font-semibold text-muted">
        <input type="checkbox" name="take" value={name} checked={checked} onChange={(e) => setChecked(e.target.checked)} className="h-4 w-4 accent-ink" />
        {label}
      </label>
      <div className="flex min-w-0 flex-col gap-1">
        <Input ref={ref} name={name} type={type} aria-label={label} placeholder={label} defaultValue={suggested} className={checked ? "" : "text-muted"} />
        {saved && (
          <span className="text-xs text-muted">
            gespeichert: <span className="text-ink">{saved}</span>
          </span>
        )}
      </div>
    </div>
  );
}

type Props = {
  mailId: number;
  companies: { id: number; name: string }[];
  tagOptions: TagOptions;
  onClose: () => void;
  // Firmen-Zeitleiste: Firma vorbelegt, Projekt der Mail vorbelegt, Domain nur per Häkchen lernen, Mailtext steht schon darüber
  companyId?: number;
  dealId?: number | null;
  embedded?: boolean;
};

// Mail lesen und Absender mit den Daten aus der Signatur übernehmen; bei bekanntem Kontakt gespeichert und Signatur nebeneinander
export function MailContactPanel({ mailId, companies, tagOptions, onClose, companyId, dealId, embedded = false }: Props) {
  const [data, setData] = useState<MailForContact | { error: string } | null>(null);
  const [state, action, pending] = useActionState(createContactFromMailAction.bind(null, mailId), undefined);
  const [, startLoading] = useTransition();
  useEffect(() => {
    startLoading(async () => setData(await loadMailForContactAction(mailId, companyId)));
  }, [mailId, companyId]);
  const box = embedded ? "mt-2 rounded-xl bg-bg p-3" : "mt-3 rounded-xl bg-bg p-4";

  if (!data) return <p className={`${box} text-sm text-muted`}>Mail wird geladen und Signatur ausgelesen …</p>;
  if ("error" in data) return <div className="mt-3"><FormError message={data.error} /></div>;
  if (state && !state.error && !pending) {
    return (
      <p role="status" className={`${box} flex items-center gap-3 text-sm`}>
        {data.known ? "Gespeichert." : "Übernommen und zugeordnet."}
        <button type="button" onClick={onClose} className={btnQuiet}>Schließen</button>
      </p>
    );
  }
  const s = data.suggestion;
  const k = data.known;
  const c = data.company;
  const domain = s.email.split("@")[1];
  // Position, Mail und Telefon gehören zur Zuordnung bei dieser Firma; bei einer anderen Firma gibt es hier noch nichts
  const here = k && !k.elsewhere ? k : null;
  const lx = (v: string | null) => !!k?.fromLexware && !!v;

  const form = (
    <form action={action} className="flex flex-col gap-3">
      {data.hint && c && <RatingHintView companyId={c.id} {...data.hint} />}
      {k ? (
        <>
          <input type="hidden" name="knownId" value={k.id} />
          <input type="hidden" name="compare" value="1" />
          <p className="text-xs text-muted">
            Schon gespeichert als{" "}
            <Link href={`/kontakte/${k.personId}`} className="font-semibold text-ink hover:underline">
              {[k.firstName, k.lastName].filter(Boolean).join(" ") || "Ohne Namen"}
            </Link>
            {k.elsewhere && ` (${k.elsewhere === "früher" ? "dort früher" : `bisher bei ${k.elsewhere}`})`}. Angehakte Felder werden übernommen.
          </p>
        </>
      ) : (
        <>
          {c && <input type="hidden" name="compare" value="1" />}
          <p className="text-xs text-muted">Aus der Signatur vorausgefüllt, bitte kurz prüfen.</p>
        </>
      )}
      {c && <input type="hidden" name="compareCompanyId" value={c.id} />}
      {(!c || !embedded) && <KindFields options={tagOptions} />}
      <Field label="Firma oder Person" hint={embedded ? "Ändern, wenn die Mail zu einer anderen Firma gehört" : "Vorhandene wählen oder neuen Namen eingeben"}>
        <Input name="companyName" list={`companies-${mailId}`} required autoComplete="off" defaultValue={c?.name ?? s.company} />
      </Field>
      <datalist id={`companies-${mailId}`}>
        {companies.map((o) => <option key={o.id} value={o.name} />)}
      </datalist>
      {c && !embedded && (
        <p className="-mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          Erkannt: <span className="font-semibold text-ink">{c.name}</span>
          <LexwareBadge company={c} />
        </p>
      )}
      {/* in der Zeitleiste nur für Mails ohne Projekt; zugeordnete hängt man dort über die Projekt-Pill um */}
      {data.projects.length > 0 && !(embedded && dealId) && <ProjectPicker projects={data.projects} companyName={c?.name ?? ""} preset={embedded ? null : undefined} />}

      {k ? (
        <div className="flex flex-col gap-2">
          <CompareRow name="firstName" label="Vorname" saved={k.firstName} suggested={s.firstName} locked={lx(k.firstName)} />
          <CompareRow name="lastName" label="Nachname" saved={k.lastName} suggested={s.lastName} locked={lx(k.lastName)} />
          {here ? (
            <>
              <CompareRow name="position" label="Position" saved={here.position} suggested={s.position} />
              <CompareRow name="email" label="E-Mail" type="email" saved={here.email} suggested={s.email} locked={lx(here.email)} />
              <CompareRow name="phone" label="Telefon" saved={here.phone} suggested={s.phone} locked={lx(here.phone)} />
            </>
          ) : (
            <>
              <Input name="position" aria-label="Position" placeholder="Position / Tätigkeit" defaultValue={s.position} />
              <Input name="email" type="email" aria-label="E-Mail" placeholder="E-Mail" defaultValue={s.email} />
              <Input name="phone" aria-label="Telefon" placeholder="Telefon" defaultValue={s.phone} />
            </>
          )}
          <CompareRow name="mobile" label="Mobil" saved={k.mobile} suggested={s.mobile} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Input name="firstName" aria-label="Vorname" placeholder="Vorname" defaultValue={s.firstName} />
            <Input name="lastName" aria-label="Nachname" placeholder="Nachname" defaultValue={s.lastName} />
          </div>
          <Input name="position" aria-label="Position" placeholder="Position / Tätigkeit" defaultValue={s.position} />
          <Input name="email" type="email" aria-label="E-Mail" placeholder="E-Mail" defaultValue={s.email} />
          <div className="grid grid-cols-2 gap-2">
            <Input name="phone" aria-label="Telefon" placeholder="Telefon" defaultValue={s.phone} />
            <Input name="mobile" aria-label="Mobil" placeholder="Mobil" defaultValue={s.mobile} />
          </div>
        </>
      )}

      {c ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted">
            Firma {c.name} <LexwareBadge company={c} />
          </p>
          <CompareRow name="website" label="Website" saved={c.website} suggested={s.website} />
          {!c.lexwareId && <AddressSearch />}
          <CompareRow name="street" label="Straße" saved={c.street} suggested={s.street} locked={!!c.lexwareId && !!c.street} />
          <CompareRow name="zip" label="PLZ" saved={c.zip} suggested={s.zip} locked={!!c.lexwareId && !!c.zip} />
          <CompareRow name="city" label="Ort" saved={c.city} suggested={s.city} locked={!!c.lexwareId && !!c.city} />
        </div>
      ) : (
        <>
          <Input name="website" aria-label="Website" placeholder="Website" defaultValue={s.website} />
          <AddressSearch />
          <Input name="street" aria-label="Straße" placeholder="Straße" defaultValue={s.street} />
          <div className="grid grid-cols-[6rem_1fr] gap-2">
            <Input name="zip" aria-label="PLZ" placeholder="PLZ" defaultValue={s.zip} />
            <Input name="city" aria-label="Ort" placeholder="Ort" defaultValue={s.city} />
          </div>
        </>
      )}
      {domain && !c?.emailDomain && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" name="learnDomain" defaultChecked={!embedded} className="h-5 w-5 accent-ink" />
          Künftig alle Mails von @{domain} hier zuordnen
        </label>
      )}
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : k ? "Speichern" : "Übernehmen"}</button>
        <button type="button" onClick={onClose} className={btnQuiet}>Schließen</button>
      </div>
    </form>
  );

  if (embedded) return <div className={box}>{form}</div>;
  return (
    <div className={`${box} grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]`}>
      <section aria-label="Mailtext" className="max-h-[560px] overflow-auto rounded-lg bg-surface p-4 text-[13px] leading-relaxed whitespace-pre-wrap">
        {data.text || "(kein Text)"}
      </section>
      {form}
    </div>
  );
}
