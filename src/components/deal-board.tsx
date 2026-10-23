"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moveDealAction } from "@/app/(app)/actions";
import { LOST_REASONS, type LostReason, type Stage } from "@/db/schema";
import { daysSince, euro } from "@/lib/format";
import { BOARD_STAGES, LOST_REASON_LABEL, STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import type { DealRow } from "@/lib/queries";
import { Badge, btnPrimary, btnQuiet, Field, Input, Select, Textarea } from "./ui";

// Ab wann eine Karte in ihrer Phase als „hängt“ markiert wird (Tage)
const STALE_AFTER: Partial<Record<Stage, number>> = { angebot: 10, beauftragt: 14, erledigt: 7, rechnung: 14 };

export function DealBoard({ deals, competitors = [] }: { deals: DealRow[]; competitors?: string[] }) {
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const [lostFor, setLostFor] = useState<DealRow | null>(null);
  const [optimistic, move] = useOptimistic(deals, (state, { id, stage }: { id: number; stage: Stage }) =>
    state.map((d) => (d.id === id ? { ...d, stage, stageChangedAt: new Date() } : d)),
  );

  function drop(stage: Stage) {
    const deal = optimistic.find((d) => d.id === dragging);
    setDragging(null);
    if (!deal || deal.stage === stage) return;
    if (stage === "verloren") {
      setLostFor(deal);
      return;
    }
    startTransition(async () => {
      move({ id: deal.id, stage });
      await moveDealAction(deal.id, stage);
    });
  }

  function confirmLost(reason: LostReason, note: string, competitor: string) {
    const deal = lostFor!;
    setLostFor(null);
    startTransition(async () => {
      move({ id: deal.id, stage: "verloren" });
      await moveDealAction(deal.id, "verloren", { reason, note, competitor });
    });
  }

  return (
    <>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1320px] grid-cols-6 items-start gap-3.5">
          {BOARD_STAGES.map((stage) => {
            const cards = optimistic.filter((d) => d.stage === stage);
            const total = cards.reduce((s, d) => s + Number(d.amountNet ?? 0), 0);
            return (
              <section
                key={stage}
                aria-label={STAGE_LABEL[stage]}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(stage)}
                className={`flex min-h-40 flex-col gap-2.5 rounded-2xl p-3 ${dragging ? "bg-line" : "bg-line-soft"}`}
              >
                <div className="flex items-center gap-2 px-1 pt-1">
                  <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                  <h2 className="flex-1 text-[13px] font-semibold">{STAGE_LABEL[stage]}</h2>
                  <span className="text-xs font-semibold text-muted">{cards.length}</span>
                </div>
                <p className="px-1 text-xs text-muted">{total > 0 ? euro(total) : " "}</p>
                {cards.map((deal) => {
                  const days = daysSince(deal.stageChangedAt);
                  const stale = STALE_AFTER[stage] !== undefined && days >= STALE_AFTER[stage]!;
                  return (
                    <Link
                      key={deal.id}
                      href={`/vorgaenge/${deal.id}`}
                      draggable
                      onDragStart={() => setDragging(deal.id)}
                      onDragEnd={() => setDragging(null)}
                      className={`flex cursor-grab flex-col gap-2 rounded-xl bg-surface p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
                        stale ? "ring-[1.5px] ring-[#F3B9A4]" : ""
                      } ${dragging === deal.id ? "opacity-50" : ""}`}
                    >
                      <div className="flex gap-2 text-xs text-muted">
                        <span className="flex-1 truncate">{deal.companyName}</span>
                        <span className="tabular-nums">{deal.number}</span>
                      </div>
                      <p className="text-sm font-semibold leading-snug">{deal.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="flex-1 text-[13px] font-semibold tabular-nums">{euro(deal.amountNet)}</span>
                        {deal.compareOnly && <Badge tone="info">Vergleich?</Badge>}
                        {deal.quick && <Badge>Schnellauftrag</Badge>}
                        <Badge tone={stale ? "accent" : "neutral"}>{days <= 0 ? "heute" : `${days} T`}</Badge>
                      </div>
                    </Link>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => drop("verloren")}
        className={`rounded-2xl border-2 border-dashed px-5 py-4 text-center text-sm ${
          dragging ? "border-accent text-accent-ink" : "border-line text-muted"
        }`}
      >
        Hierher ziehen: Abgelehnt / Verloren
      </div>

      {lostFor && <LostDialog deal={lostFor} competitors={competitors} onCancel={() => setLostFor(null)} onConfirm={confirmLost} />}
    </>
  );
}

export function LostDialog({ deal, competitors, onCancel, onConfirm }: {
  deal: { title: string; compareOnly: boolean };
  competitors: string[];
  onCancel: () => void;
  onConfirm: (reason: LostReason, note: string, competitor: string) => void;
}) {
  const [reason, setReason] = useState<LostReason>(deal.compareOnly ? "vergleichsangebot" : "preis");
  const [note, setNote] = useState("");
  const [competitor, setCompetitor] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Warum verloren?">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl bg-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason, note, competitor);
        }}
      >
        <h2 className="text-lg font-bold">Warum ist „{deal.title}“ verloren?</h2>
        <Field label="Grund">
          <Select value={reason} onChange={(e) => setReason(e.target.value as LostReason)}>
            {LOST_REASONS.map((r) => (
              <option key={r} value={r}>{LOST_REASON_LABEL[r]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Wer hat den Auftrag bekommen? (optional)" hint="Weißt du es noch nicht, trägst du es später im Vorgang nach.">
          <Input value={competitor} onChange={(e) => setCompetitor(e.target.value)} list="competitor-names" autoComplete="off" placeholder="Name des Wettbewerbers" />
          <datalist id="competitor-names">
            {competitors.map((c) => <option key={c} value={c} />)}
          </datalist>
        </Field>
        <Field label="Notiz (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. war 30 % günstiger" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={btnQuiet}>Abbrechen</button>
          <button type="submit" className={btnPrimary}>Speichern</button>
        </div>
      </form>
    </div>
  );
}
