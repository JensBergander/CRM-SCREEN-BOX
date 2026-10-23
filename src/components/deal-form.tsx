"use client";

import { useActionState } from "react";
import { createDealAction } from "@/app/(app)/actions";
import { btnPrimary, Field, FormError, Input, Select, Textarea } from "./ui";

export function DealForm({ companies, preset, quick, today, fromMail }: {
  companies: { id: number; name: string }[];
  preset?: { id: number; name: string } | null;
  quick: boolean;
  today: string;
  fromMail?: { id: number; subject: string } | null;
}) {
  const [state, action, pending] = useActionState(createDealAction, undefined);

  return (
    <form action={action} className="flex max-w-xl flex-col gap-4 rounded-2xl bg-surface p-6">
      {fromMail && <input type="hidden" name="mailId" value={fromMail.id} />}
      {quick && <input type="hidden" name="quick" value="1" />}
      {quick && <input type="hidden" name="stage" value="beauftragt" />}

      <Field label="Firma" hint={preset ? undefined : "Aus der Liste wählen oder neuen Namen eingeben"}>
        <Input
          name="companyName"
          list="company-names"
          defaultValue={preset?.name}
          required
          autoComplete="off"
          autoFocus={!preset}
          placeholder="z. B. Eurowings GmbH"
        />
        <datalist id="company-names">
          {companies.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </Field>

      <Field label={quick ? "Was ist zu tun?" : "Vorgang"}>
        <Input
          name="title"
          required
          autoFocus={!!preset}
          defaultValue={fromMail?.subject.replace(/^(AW|WG|RE|FW|Fwd):\s*/i, "")}
          placeholder="z. B. Fotos vom neuen Lager"
        />
      </Field>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Field label={quick ? "Termin" : "Projektdatum"}>
          <Input name="projectDate" type="date" defaultValue={quick ? today : undefined} />
        </Field>
        <Field label="Betrag netto (€)">
          <Input name="amountNet" inputMode="decimal" placeholder="optional" />
        </Field>
      </div>

      {!quick && (
        <>
          <Field label="Phase">
            <Select name="stage" defaultValue="anfrage">
              <option value="anfrage">Anfrage</option>
              <option value="angebot">Angebot verschickt</option>
              <option value="beauftragt">Beauftragt</option>
            </Select>
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" name="compareOnly" className="h-5 w-5 accent-ink" />
            Vermutlich nur Vergleichsangebot
          </label>
          <Field label="Notiz">
            <Textarea name="notes" placeholder="Wer hat angefragt, was ist wichtig?" />
          </Field>
        </>
      )}

      <FormError message={state?.error} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Wird angelegt …" : quick ? "Schnellauftrag anlegen" : "Vorgang anlegen"}
      </button>
    </form>
  );
}
