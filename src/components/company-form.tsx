"use client";

import { useActionState } from "react";
import { createCompanyAction } from "@/app/(app)/actions";
import { btnPrimary, Field, FormError, Input, Textarea } from "./ui";

export function NewCompanyForm() {
  const [state, action, pending] = useActionState(createCompanyAction, undefined);
  return (
    <form action={action} className="flex max-w-xl flex-col gap-4 rounded-2xl bg-surface p-6">
      <Field label="Firmenname">
        <Input name="name" required autoFocus placeholder="z. B. Eurowings GmbH" />
      </Field>
      <Field label="Ordnername" hint="Leer lassen: wird aus dem Namen gebildet, z. B. EUROWINGS">
        <Input name="folderName" />
      </Field>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
        <Field label="Straße"><Input name="street" /></Field>
        <Field label="PLZ"><Input name="zip" /></Field>
        <Field label="Ort"><Input name="city" /></Field>
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
