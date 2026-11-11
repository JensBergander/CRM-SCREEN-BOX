"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { followUpDealAction, moveDealAction } from "@/app/(app)/actions";
import { addDaysIso, daysSince, euro } from "@/lib/format";
import type { LostReason } from "@/db/schema";
import { LostDialog } from "./deal-board";
import { Badge, btnPrimary, btnQuiet, Empty, FormError, Input, Textarea } from "./ui";

type FollowUp = {
  id: number;
  title: string;
  companyName: string;
  amountNet: string | null;
  compareOnly: boolean;
  stageChangedAt: Date;
  followUpDate: string | null;
};

// „Nachgefasst“: Notiz und neue Frist (Vorschlag in 10 Tagen)
function FollowUpForm({ deal, today, onDone }: { deal: FollowUp; today: string; onDone: () => void }) {
  const [state, action, pending] = useActionState(followUpDealAction.bind(null, deal.id), undefined);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) onDone();
    wasPending.current = pending;
  }, [pending, state, onDone]);
  const chip = "inline-flex min-h-8 items-center rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-muted hover:text-ink";
  const dateRef = useRef<HTMLInputElement>(null);
  const set = (days: number) => dateRef.current && (dateRef.current.value = addDaysIso(today, days));
  return (
    <form action={action} className="mx-5 mb-3 flex flex-col gap-2.5 rounded-xl bg-bg p-3">
      <label>
        <span className="sr-only">Notiz</span>
        <Textarea name="body" rows={2} autoFocus placeholder="Was ist rausgekommen? (optional)" className="bg-surface" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-muted">Wieder nachfassen am</span>
        <Input ref={dateRef} name="followUpDate" type="date" min={addDaysIso(today, 1)} defaultValue={addDaysIso(today, 10)} required className="w-auto" />
        <button type="button" className={chip} onClick={() => set(7)}>1 Woche</button>
        <button type="button" className={chip} onClick={() => set(14)}>2 Wochen</button>
      </div>
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Nachgefasst"}</button>
        <button type="button" onClick={onDone} className={btnQuiet}>Abbrechen</button>
      </div>
    </form>
  );
}

// Angebote ohne Rückmeldung: direkt Beauftragt, Abgelehnt (mit Grund) oder Nachgefasst (Notiz + neue Frist)
export function FollowUps({ deals, competitors, today }: { deals: FollowUp[]; competitors: string[]; today: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [lostFor, setLostFor] = useState<FollowUp | null>(null);
  const [gone, setGone] = useState<number[]>([]);
  const [pending, startTransition] = useTransition();
  const visible = deals.filter((d) => !gone.includes(d.id));
  const act = (id: number, run: () => Promise<unknown>) =>
    startTransition(async () => {
      setGone((g) => [...g, id]);
      await run();
    });

  if (!visible.length) return <Empty>Keine Angebote, die auf Antwort warten.</Empty>;
  return (
    <>
      <ul>
        {visible.map((deal) => (
          <li key={deal.id} className="border-t border-line-soft">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
              <Link href={`/vorgaenge/${deal.id}`} className="min-w-0 flex-[1_1_200px]">
                <p className="text-sm font-semibold">{deal.companyName}</p>
                <p className="truncate text-[13px] text-muted">{deal.title} · {euro(deal.amountNet)}</p>
              </Link>
              {deal.compareOnly && <Badge tone="info">Vergleichsangebot?</Badge>}
              <span className="whitespace-nowrap text-xs text-muted">
                {deal.followUpDate ? "Frist erreicht" : `${daysSince(deal.stageChangedAt)} Tage`}
              </span>
              <div className="flex w-full flex-wrap gap-1.5 sm:w-auto">
                <button type="button" disabled={pending} onClick={() => act(deal.id, () => moveDealAction(deal.id, "beauftragt"))} className={btnQuiet}>
                  Beauftragt
                </button>
                <button type="button" disabled={pending} onClick={() => setLostFor(deal)} className={btnQuiet}>
                  Abgelehnt
                </button>
                <button type="button" onClick={() => setOpen(open === deal.id ? null : deal.id)} aria-expanded={open === deal.id} className={btnQuiet}>
                  Nachgefasst
                </button>
              </div>
            </div>
            {open === deal.id && <FollowUpForm deal={deal} today={today} onDone={() => setOpen(null)} />}
          </li>
        ))}
      </ul>
      {lostFor && (
        <LostDialog
          deal={lostFor}
          competitors={competitors}
          onCancel={() => setLostFor(null)}
          onConfirm={(reason: LostReason, note: string, competitor: string) => {
            const deal = lostFor;
            setLostFor(null);
            act(deal.id, () => moveDealAction(deal.id, "verloren", { reason, note, competitor }));
          }}
        />
      )}
    </>
  );
}
