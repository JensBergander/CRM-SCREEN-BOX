"use client";

import Link from "next/link";
import { useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { ChevronsLeft } from "lucide-react";
import { moveDealAction } from "@/app/(app)/actions";
import { LOST_REASONS, type LostReason, type Stage } from "@/db/schema";
import { daysSince, euro } from "@/lib/format";
import { BOARD_STAGES, LOST_REASON_LABEL, STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { STAGE_TONE, TONE_WASH } from "@/lib/tones";
import type { DealRow } from "@/lib/queries";
import { PlanningDialog } from "./planning";
import { Badge, btnPrimary, btnQuiet, Field, Input, Select, Textarea } from "./ui";

// Ab wann eine Karte in ihrer Phase als „hängt“ markiert wird (Tage)
const STALE_AFTER: Partial<Record<Stage, number>> = { angebot: 10, beauftragt: 14, erledigt: 7 };
const COLLAPSE_KEY = "crm-board-collapsed";

type Payment = { expected: string; mismatch: { invoiceDays: number; termDays: number } | null };
type Hint = { text: string; danger?: boolean; title?: string; warn?: string };

const berlinDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
// „03.12.“
const short = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const days = (n: number) => (n === 1 ? "1 Tag" : `${n} Tagen`);

// Die Angabe, die in der jeweiligen Spalte zählt
function cardHint(deal: DealRow, today: string, payment?: Payment, shoot?: string): Hint {
  const since = daysSince(deal.stageChangedAt);
  const stale = STALE_AFTER[deal.stage] !== undefined && since >= STALE_AFTER[deal.stage]!;
  switch (deal.stage) {
    case "anfrage":
      return { text: since <= 0 ? "heute angefragt" : `seit ${days(since)}` };
    case "angebot":
      if (deal.followUpDate && deal.followUpDate > today) return { text: `nachfassen ab ${short(deal.followUpDate)}` };
      return { text: since <= 0 ? "heute verschickt" : `seit ${days(since)} offen`, danger: stale, title: stale ? "Bitte nachfassen" : undefined };
    case "beauftragt": {
      const next = shoot ?? (deal.projectDate && deal.projectDate >= today ? deal.projectDate : null);
      if (next) return { text: next === today ? "Dreh heute" : `Dreh ${short(next)}` };
      return { text: "ohne Drehtermin", danger: stale, title: "Kein Produktionstag geplant" };
    }
    case "bearbeitung":
      if (deal.postEnd && deal.postEnd >= today) return { text: `fertig bis ${short(deal.postEnd)}` };
      return {
        text: deal.postEnd ? `Ende war ${short(deal.postEnd)}` : "Ende offen",
        danger: true,
        title: "Auf der Startseite oder im Vorgang eintragen, wie lange du noch brauchst",
      };
    case "erledigt":
      return { text: since <= 0 ? "heute erledigt" : `seit ${days(since)} ohne Rechnung`, danger: stale, title: stale ? "Bitte Rechnung schreiben" : undefined };
    case "rechnung": {
      if (!payment) return { text: since <= 0 ? "heute gestellt" : `seit ${days(since)} gestellt` };
      const overdue = payment.expected < today;
      return {
        text: overdue ? `überfällig seit ${short(payment.expected)}` : `fällig ${short(payment.expected)}`,
        danger: overdue,
        warn: payment.mismatch ? `Ziel ${payment.mismatch.termDays} T` : undefined,
        title: payment.mismatch
          ? `Rechnung mit ${payment.mismatch.invoiceDays} Tagen Zahlungsziel, ${deal.companyName} zahlt üblich nach ${payment.mismatch.termDays} Tagen. „Zahlung prüfen“ richtet sich nach dem späteren Datum.`
          : undefined,
      };
    }
    case "bezahlt":
      return { text: `bezahlt ${short(berlinDay.format(deal.stageChangedAt))}` };
    default:
      return { text: "" };
  }
}

const collapseListeners = new Set<() => void>();
function subscribeCollapsed(listener: () => void) {
  collapseListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    collapseListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function parseCollapsed(raw: string): Stage[] {
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((s): s is Stage => BOARD_STAGES.includes(s)) : [];
  } catch {
    return [];
  }
}

export function DealBoard({ deals, competitors = [], today, payments = {}, shoots = {}, paid }: {
  deals: DealRow[];
  competitors?: string[];
  today: string;
  payments?: Record<number, Payment>;
  shoots?: Record<number, string>;
  paid?: { total: number; days: number; href: string };
}) {
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<number | null>(null);
  const [lostFor, setLostFor] = useState<DealRow | null>(null);
  const [planFor, setPlanFor] = useState<DealRow | null>(null);
  // eingeklappte Spalten; je Browser gemerkt (localStorage als externer Speicher, auf dem Server leer)
  const collapsedRaw = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "[]");
  const collapsed = parseCollapsed(collapsedRaw);
  const toggle = (stage: Stage) => {
    const next = collapsed.includes(stage) ? collapsed.filter((s) => s !== stage) : [...collapsed, stage];
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {}
    collapseListeners.forEach((l) => l());
  };
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
    // Beim Beauftragen gleich die Produktion planen
    if (stage === "beauftragt") setPlanFor(deal);
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
      {/* Spalten fest 260 px breit, seitlich scrollen; ab Tablet scrollt das Board in sich, damit die Spaltenköpfe oben stehen bleiben */}
      <div className="relative snap-x snap-proximity overflow-x-auto pb-2 [scroll-padding-inline:4px] md:max-h-[calc(100dvh-12rem)] md:overflow-y-auto">
        <div className="flex w-max items-start gap-3.5">
          {BOARD_STAGES.map((stage) => {
            const cards = optimistic
              .filter((d) => d.stage === stage)
              // Bezahlt: neueste oben
              .sort((a, b) => (stage === "bezahlt" ? b.stageChangedAt.getTime() - a.stageChangedAt.getTime() : 0));
            const total = cards.reduce((s, d) => s + Number(d.amountNet ?? 0), 0);
            const wash = TONE_WASH[STAGE_TONE[stage]][dragging ? "drag" : "idle"];
            const closed = collapsed.includes(stage);
            return (
              <section
                key={stage}
                aria-label={STAGE_LABEL[stage]}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(stage)}
                className={`flex min-h-40 shrink-0 snap-start flex-col rounded-2xl ${wash} ${closed ? "w-14" : "w-[260px]"}`}
              >
                {closed ? (
                  <button
                    type="button"
                    onClick={() => toggle(stage)}
                    aria-expanded="false"
                    title={`${STAGE_LABEL[stage]} aufklappen`}
                    className="flex min-h-40 flex-col items-center gap-3 rounded-2xl px-1 py-3"
                  >
                    <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                    <span className="text-xs font-semibold text-muted">{cards.length}</span>
                    <span className="text-[13px] font-semibold [writing-mode:vertical-rl]">{STAGE_LABEL[stage]}</span>
                    {total > 0 && <span className="text-[11px] text-muted [writing-mode:vertical-rl]">{euro(total)}</span>}
                  </button>
                ) : (
                  <>
                    {/* deckender Kopf: steht beim Scrollen der Karten oben */}
                    <div className="sticky top-0 z-10 rounded-t-2xl bg-bg">
                      <div className={`rounded-t-2xl px-4 pb-2 pt-3 ${wash}`}>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} />
                          <h2 className="flex-1 text-[13px] font-semibold">{STAGE_LABEL[stage]}</h2>
                          <span className="text-xs font-semibold text-muted">{cards.length}</span>
                          <button
                            type="button"
                            onClick={() => toggle(stage)}
                            aria-expanded="true"
                            aria-label={`${STAGE_LABEL[stage]} einklappen`}
                            title="Einklappen"
                            className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface/70 hover:text-ink pointer-coarse:h-10 pointer-coarse:w-10"
                          >
                            <ChevronsLeft size={15} aria-hidden="true" />
                          </button>
                        </div>
                        <p className="text-xs text-muted">
                          {total > 0 ? euro(total) : " "}
                          {stage === "bezahlt" && paid && <> · letzte {paid.days} Tage</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2.5 px-3 pb-3">
                      {cards.map((deal) => {
                        const hint = cardHint(deal, today, payments[deal.id], shoots[deal.id]);
                        return (
                          <Link
                            key={deal.id}
                            href={`/vorgaenge/${deal.id}`}
                            draggable
                            onDragStart={() => setDragging(deal.id)}
                            onDragEnd={() => setDragging(null)}
                            className={`flex cursor-grab flex-col gap-2 rounded-xl bg-surface p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
                              hint.danger ? "ring-[1.5px] ring-danger/40" : ""
                            } ${dragging === deal.id ? "opacity-50" : ""}`}
                          >
                            <p className="truncate text-xs text-muted">{deal.companyName}</p>
                            <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere] hyphens-auto" lang="de">{deal.title}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="flex-1 text-[13px] font-semibold tabular-nums">{euro(deal.amountNet)}</span>
                              {deal.compareOnly && <Badge tone="info">Vergleich?</Badge>}
                              {deal.quick && <Badge>Schnellauftrag</Badge>}
                            </div>
                            {hint.text && (
                              <div className="flex flex-wrap items-center gap-1.5" title={hint.title}>
                                <Badge tone={hint.danger ? "danger" : "neutral"}>{hint.text}</Badge>
                                {hint.warn && <Badge tone="info">{hint.warn}</Badge>}
                                {hint.title && <span className="sr-only">{hint.title}</span>}
                              </div>
                            )}
                          </Link>
                        );
                      })}
                      {stage === "bezahlt" && paid && paid.total > cards.length && (
                        <Link href={paid.href} className="rounded-xl px-2 py-2 text-center text-[13px] font-semibold text-muted hover:bg-surface/70 hover:text-ink">
                          Alle {paid.total} bezahlten →
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => drop("verloren")}
        className={`rounded-2xl border-2 border-dashed px-5 py-4 text-center text-sm pointer-coarse:hidden ${
          dragging ? "border-muted bg-line-soft text-ink" : "border-line text-muted"
        }`}
      >
        Hierher ziehen: Abgelehnt / Verloren
      </div>

      {lostFor && <LostDialog deal={lostFor} competitors={competitors} onCancel={() => setLostFor(null)} onConfirm={confirmLost} />}
      {planFor && <PlanningDialog dealId={planFor.id} title={`${planFor.companyName} · ${planFor.title}`} onClose={() => setPlanFor(null)} />}
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
