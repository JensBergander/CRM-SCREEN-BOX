"use client";

import { useTransition } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { linkVoucherAction } from "@/app/(app)/actions";
import type { LexwareVoucher } from "@/db/schema";
import { euro } from "@/lib/format";
import { Badge, btnQuiet, Empty } from "./ui";

type LineItem = { name: string; description: string | null; quantity: number | null; unitName: string | null; net: number | null; total: number | null; optional: boolean };
export type VoucherView = LexwareVoucher & { url: string; pdfUrl: string | null; items: LineItem[]; newer: boolean };

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

const linkClass = "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-bg px-3.5 text-[13px] font-semibold hover:bg-line";

function VoucherRow({ v, action, showItems }: { v: VoucherView; action?: React.ReactNode; showItems?: boolean }) {
  const status = STATUS[v.status] ?? { label: v.status, tone: "neutral" as const };
  return (
    <div className="border-t border-line-soft px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-[1_1_200px]">
          <p className="text-sm font-semibold">
            {v.type === "invoice" ? "Rechnung" : "Angebot"} {v.number}
          </p>
          <p className="text-xs text-muted">
            {v.voucherDate?.toLocaleDateString("de-DE")} · netto {euro(v.netAmount)} · brutto {euro(v.totalAmount)}
          </p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
        {v.pdfUrl && (
          <a href={v.pdfUrl} target="_blank" rel="noreferrer" className={linkClass} aria-label={`PDF von ${v.number} öffnen`}>
            <FileText size={14} aria-hidden="true" /> PDF
          </a>
        )}
        <a href={v.url} target="_blank" rel="noreferrer" className={linkClass} aria-label={`${v.number} in Lexware öffnen`}>
          <ExternalLink size={14} aria-hidden="true" /> Lexware
        </a>
        {action}
      </div>
      {showItems && !v.pdfUrl && v.status !== "draft" && (
        <p className="mt-1 text-xs text-muted">Keine PDF-Kopie im CRM (bei abgeschlossenen Projekten nach 90 Tagen entfernt). Das Original liegt in Lexware.</p>
      )}
      {showItems && v.items.length > 0 && (
        <table className="mt-3 w-full text-[13px]">
          <tbody>
            {v.items.map((item, i) => (
              <tr key={i} className="border-t border-line-soft align-top">
                <td className="py-1.5 pr-3">
                  <span className="font-medium">{item.name}</span>
                  {item.optional && <span className="ml-1.5 text-xs text-muted">(optional)</span>}
                  {item.description && <span className="block whitespace-pre-line text-xs text-muted">{item.description}</span>}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums text-muted">
                  {item.quantity !== null && `${item.quantity.toLocaleString("de-DE")} ${item.unitName ?? ""}`}
                </td>
                <td className="whitespace-nowrap py-1.5 text-right tabular-nums">{item.total !== null ? euro(item.total) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function LexwareVouchers({ dealId, linked, candidates, hasLexware }: {
  dealId: number;
  linked: VoucherView[];
  candidates: VoucherView[];
  hasLexware: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (!hasLexware) return <Empty>Diese Firma ist nicht mit Lexware verknüpft (nicht aus Lexware importiert).</Empty>;
  const newer = candidates.filter((v) => v.newer);
  const others = candidates.filter((v) => !v.newer);
  const link = (v: VoucherView, label: string) => (
    <button type="button" disabled={pending} onClick={() => startTransition(() => linkVoucherAction(dealId, v.id))} className={btnQuiet}>
      {label}
    </button>
  );
  return (
    <>
      {newer.length > 0 && (
        <div className="mx-5 mb-2 mt-1 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink" role="status">
          Für diese Firma gibt es ein neueres Angebot ({newer.map((v) => v.number).join(", ")}). Ist es die überarbeitete Fassung,
          verknüpfe es stattdessen.
        </div>
      )}
      {newer.map((v) => <VoucherRow key={v.id} v={v} showItems action={link(v, "Stattdessen verknüpfen")} />)}
      {linked.length === 0 && <Empty>Noch kein Angebot und keine Rechnung verknüpft. Die App verknüpft eindeutige Fälle selbst.</Empty>}
      {linked.map((v) => <VoucherRow key={v.id} v={v} showItems />)}
      {others.length > 0 && (
        <>
          <p className="border-t border-line-soft px-5 pb-1 pt-4 text-xs font-semibold text-muted">Weitere Belege dieser Firma (noch keinem Vorgang zugeordnet)</p>
          {others.slice(0, 8).map((v) => <VoucherRow key={v.id} v={v} action={link(v, "Verknüpfen")} />)}
        </>
      )}
    </>
  );
}
