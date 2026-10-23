"use client";

import { useActionState } from "react";
import { createCompanyAction } from "@/app/(app)/actions";
import type { CompanyKind } from "@/db/schema";
import type { TagOptions } from "@/lib/service-tags";
import { KindFields } from "./forms";
import { AddressSearch } from "./place-input";
import { btnPrimary, Field, FormError, Input, Textarea } from "./ui";

export function NewCompanyForm({ kind, tagOptions }: { kind?: CompanyKind; tagOptions: TagOptions }) {
  const [state, action, pending] = useActionState(createCompanyAction, undefined);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4 rounded-2xl bg-surface p-6">
      <KindFields kind={kind} options={tagOptions} withCompetitor />
      <Field label="Name (Firma oder Person)">
        <Input name="name" required autoFocus placeholder="z. B. Eurowings GmbH" />
      </Field>
      <Field label="Ordnername" hint="Leer lassen: wird aus dem Namen gebildet, z. B. EUROWINGS">
        <Input name="folderName" />
      </Field>
      <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
        Adresse suchen
        <AddressSearch fillName />
        <span className="text-xs font-normal">füllt Straße, PLZ und Ort aus, leere Felder wie Name und Website auch</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <Field label="Straße"><Input name="street" /></Field>
        <Field label="PLZ"><Input name="zip" /></Field>
        <Field label="Ort"><Input name="city" /></Field>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Field label="Telefon (Zentrale)"><Input name="phone" type="tel" /></Field>
        <Field label="E-Mail (allgemein)"><Input name="email" type="email" /></Field>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <Field label="Website"><Input name="website" placeholder="https://" /></Field>
        <Field label="Mail-Domain" hint="für die Zuordnung der Mails"><Input name="emailDomain" placeholder="firma.de" /></Field>
      </div>
      <Field label="Branche"><Input name="industry" /></Field>
      <Field label="Notiz"><Textarea name="notes" /></Field>
      <FormError message={state?.error} />
      <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Wird angelegt …" : "Firma anlegen"}</button>
    </form>
  );
}
