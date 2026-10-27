"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { addSupplierAction, removeSupplierAction, updateSupplierAction } from "@/app/(app)/actions";
import type { SupplierRow } from "@/lib/queries";
import { euro } from "@/lib/format";
import { useResetOnSuccess } from "./forms";
import { btnQuiet, Empty, FormError, Input } from "./ui";

// Betrag aus der Datenbank (12.50) für das Eingabefeld (12,50)
const costInput = (v: string | null) => (v === null ? "" : v.replace(".", ","));

function SupplierItem({ row }: { row: SupplierRow }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateSupplierAction.bind(null, row.id), undefined);
  const [removing, startRemove] = useTransition();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) setEditing(false);
    wasPending.current = pending;
  }, [pending, state]);

  if (editing) {
    return (
      <li className="border-t border-line-soft px-5 py-3">
        <p className="mb-2 text-sm font-semibold">{row.name}</p>
        <form action={action} className="flex flex-wrap items-center gap-2">
          <label className="min-w-0 flex-[1_1_200px]">
            <span className="sr-only">Notiz</span>
            <Input name="note" defaultValue={row.note ?? ""} placeholder="z. B. Licht-Set, 2 Tage" autoFocus />
          </label>
          <label className="w-32">
            <span className="sr-only">Kosten netto</span>
            <Input name="costNet" defaultValue={costInput(row.costNet)} placeholder="€ netto" inputMode="decimal" />
          </label>
          <button type="submit" disabled={pending} className={btnQuiet}>{pending ? "Speichert …" : "Speichern"}</button>
          <button type="button" onClick={() => setEditing(false)} className="text-[13px] text-muted hover:text-ink">Abbrechen</button>
          <button
            type="button"
            disabled={removing}
            onClick={() => startRemove(() => removeSupplierAction(row.id))}
            aria-label={`${row.name} aus diesem Projekt entfernen`}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </form>
        <FormError message={state?.error} />
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 border-t border-line-soft px-5 py-3">
      <span className="h-2 w-2 shrink-0 rounded-full bg-supplier" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Link href={`/firmen/${row.companyId}`} className="text-sm font-semibold hover:underline">{row.name}</Link>
        <p className="truncate text-xs text-muted">{row.note || row.tags || "noch keine Notiz"}</p>
      </div>
      <span className="text-[13px] tabular-nums">{euro(row.costNet)}</span>
      <button type="button" onClick={() => setEditing(true)} aria-label={`${row.name} bearbeiten`} className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
        <Pencil size={15} aria-hidden="true" />
      </button>
    </li>
  );
}

// Lieferanten eines Projekts mit Notiz und Kosten; unten die Rechnung Auftrag minus Lieferanten
export function SupplierCard({ dealId, amountNet, rows, options }: { dealId: number; amountNet: string | null; rows: SupplierRow[]; options: string[] }) {
  const [state, action, pending] = useActionState(addSupplierAction.bind(null, dealId), undefined);
  const ref = useResetOnSuccess(state, pending);
  const cost = rows.reduce((s, r) => s + Number(r.costNet ?? 0), 0);
  const listId = `suppliers-${dealId}`;

  return (
    <>
      {rows.length === 0 && <Empty>Noch keine Lieferanten. Mails von Lieferanten, die du diesem Projekt zuordnest, erscheinen hier automatisch.</Empty>}
      <ul>
        {rows.map((r) => <SupplierItem key={r.id} row={r} />)}
      </ul>
      {rows.length > 0 && (
        <p className="border-t border-line-soft px-5 py-3 text-[13px] tabular-nums">
          {amountNet !== null ? (
            <>
              Auftrag {euro(amountNet)} · Lieferanten {euro(cost)} · <span className="font-semibold">bleibt {euro(Number(amountNet) - cost)}</span>
            </>
          ) : (
            <>Lieferanten {euro(cost)} <span className="text-muted">· Auftragswert unter „Details“ eintragen, dann steht hier, was übrig bleibt</span></>
          )}
        </p>
      )}
      <form ref={ref} action={action} className="flex flex-wrap items-center gap-2 border-t border-line-soft px-5 py-3.5">
        <label className="min-w-0 flex-[1_1_180px]">
          <span className="sr-only">Lieferant</span>
          <Input name="name" list={listId} placeholder="Lieferant wählen oder neu" autoComplete="off" required />
        </label>
        <datalist id={listId}>
          {options.map((o) => <option key={o} value={o} />)}
        </datalist>
        <label className="min-w-0 flex-[1_1_160px]">
          <span className="sr-only">Notiz</span>
          <Input name="note" placeholder="Notiz, z. B. Licht-Set" />
        </label>
        <label className="w-28">
          <span className="sr-only">Kosten netto</span>
          <Input name="costNet" placeholder="€ netto" inputMode="decimal" />
        </label>
        <button type="submit" disabled={pending} className={btnQuiet}>{pending ? "Speichert …" : "Hinzufügen"}</button>
        <FormError message={state?.error} />
      </form>
    </>
  );
}
