"use client";

import { useTransition } from "react";
import { linkVoucherAction } from "@/app/(app)/actions";
import type { LexwareVoucher } from "@/db/schema";
import { euro } from "@/lib/format";
import { Badge, btnQuiet, Empty } from "./ui";

const STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "info" | "ok" }> = {
  open: { label: "offen", tone: "neutral" },
  overdue: { label: "überfällig", tone: "accent" },
  paid: { label: "bezahlt", tone: "ok" },
  paidoff: { label: "bezahlt", tone: "ok" },
  accepted: { label: "angenommen", tone: "ok" },
  rejected: { label: "abgelehnt", tone: "neutral" },
  voided: { label: "storniert", tone: "neutral" },
  draft: { label: "Entwurf", tone: "neutral" },
};

function VoucherRow({ v, action }: { v: LexwareVoucher; action?: React.ReactNode }) {
  const status = STATUS[v.status] ?? { label: v.status, tone: "neutral" as const };
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {v.type === "invoice" ? "Rechnung" : "Angebot"} {v.number}
        </p>
        <p className="text-xs text-muted">
          {v.voucherDate?.toLocaleDateString("de-DE")} · netto {euro(v.netAmount)} · brutto {euro(v.totalAmount)}
        </p>
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
      {action}
    </div>
  );
}

export function LexwareVouchers({ dealId, linked, candidates, hasLexware }: {
  dealId: number;
  linked: LexwareVoucher[];
  candidates: LexwareVoucher[];
  hasLexware: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (!hasLexware) return <Empty>Diese Firma ist nicht mit Lexware verknüpft (nicht aus Lexware importiert).</Empty>;
  return (
    <>
      {linked.length === 0 && <Empty>Noch kein Angebot und keine Rechnung verknüpft. Die App verknüpft eindeutige Fälle selbst.</Empty>}
      {linked.map((v) => <VoucherRow key={v.id} v={v} />)}
      {candidates.length > 0 && (
        <>
          <p className="border-t border-line-soft px-5 pb-1 pt-4 text-xs font-semibold text-muted">Weitere Belege dieser Firma (noch keinem Vorgang zugeordnet)</p>
          {candidates.slice(0, 8).map((v) => (
            <VoucherRow
              key={v.id}
              v={v}
              action={
                <button type="button" disabled={pending} onClick={() => startTransition(() => linkVoucherAction(dealId, v.id))} className={btnQuiet}>
                  Verknüpfen
                </button>
              }
            />
          ))}
        </>
      )}
    </>
  );
}
