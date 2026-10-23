"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createQuotationDraftAction } from "@/app/(app)/actions";
import { euro } from "@/lib/format";
import { btnPrimary, btnQuiet, FormError, Input } from "./ui";

type Item = { name: string; description: string; quantity: string; unitName: string; netPrice: string };
const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

export function QuotationDraft({ dealId, title, amountNet }: { dealId: number; title: string; amountNet: string | null }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([
    { name: title, description: "", quantity: "1", unitName: "pauschal", netPrice: amountNet ? amountNet.replace(".", ",") : "" },
  ]);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ url: string } | { error: string } | null>(null);
  const total = items.reduce((s, i) => s + (num(i.quantity) || 0) * (num(i.netPrice) || 0), 0);
  const update = (index: number, patch: Partial<Item>) => setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  if (!open) {
    return (
      <div className="border-t border-line-soft px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className={btnQuiet}>Angebot als Entwurf in Lexware anlegen</button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3 border-t border-line-soft px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await createQuotationDraftAction(
            dealId,
            items.map((i) => ({ name: i.name, description: i.description, quantity: num(i.quantity), unitName: i.unitName, netPrice: num(i.netPrice) })),
          );
          setResult(r);
          if ("url" in r) window.open(r.url, "_blank", "noopener");
        });
      }}
    >
      <p className="text-sm text-muted">Positionen netto, 19 % MwSt. Der Entwurf wird nicht abgeschlossen oder versendet; das machst du in Lexware.</p>
      {items.map((item, i) => (
        <fieldset key={i} className="grid grid-cols-[1fr_5rem_6rem_7rem_auto] items-start gap-2">
          <legend className="sr-only">Position {i + 1}</legend>
          <div className="flex flex-col gap-1.5">
            <Input aria-label="Bezeichnung" value={item.name} onChange={(e) => update(i, { name: e.target.value })} required />
            <Input aria-label="Beschreibung" placeholder="Beschreibung (optional)" value={item.description} onChange={(e) => update(i, { description: e.target.value })} />
          </div>
          <Input aria-label="Menge" inputMode="decimal" value={item.quantity} onChange={(e) => update(i, { quantity: e.target.value })} required />
          <Input aria-label="Einheit" value={item.unitName} onChange={(e) => update(i, { unitName: e.target.value })} required />
          <Input aria-label="Einzelpreis netto in Euro" inputMode="decimal" placeholder="Preis €" value={item.netPrice} onChange={(e) => update(i, { netPrice: e.target.value })} required />
          <button type="button" aria-label="Position entfernen" disabled={items.length === 1} onClick={() => setItems(items.filter((_, j) => j !== i))} className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-bg disabled:opacity-30">
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setItems([...items, { name: "", description: "", quantity: "1", unitName: "Stunde", netPrice: "" }])} className={btnQuiet}>
          <Plus size={14} aria-hidden="true" /> Position
        </button>
        <span className="flex-1 text-right text-sm">Summe netto <strong className="tabular-nums">{euro(total)}</strong></span>
      </div>
      {result && "error" in result && <FormError message={result.error} />}
      {result && "url" in result && (
        <p role="status" className="text-sm">
          Entwurf angelegt. <a href={result.url} target="_blank" rel="noreferrer" className="font-semibold underline">In Lexware öffnen</a>
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Legt an …" : "Entwurf in Lexware anlegen"}</button>
        <button type="button" onClick={() => setOpen(false)} className={btnQuiet}>Schließen</button>
      </div>
    </form>
  );
}
