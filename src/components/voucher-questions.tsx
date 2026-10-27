"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { archiveVoucherAction, dealFromVoucherAction, linkVoucherAction } from "@/app/(app)/actions";
import { euro } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/labels";
import type { Stage } from "@/db/schema";
import { btnQuiet, FormError } from "./ui";

export type VoucherQuestion = {
  voucher: { id: string; number: string; type: string; totalAmount: string | null; voucherDate: Date | null; url: string };
  companyId: number;
  companyName: string;
  deals: { id: number; title: string; stage: Stage }[];
};

// Startseite: neue Lexware-Belege, bei denen offen ist, zu welchem Vorgang sie gehören
export function VoucherQuestions({ items }: { items: VoucherQuestion[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      const result = await fn();
      setError(result && typeof result === "object" && "error" in result ? (result.error as string | undefined) : undefined);
    });

  return (
    <ul className="flex flex-col">
      {items.map(({ voucher: v, companyId, companyName, deals }) => (
        <li key={v.id} className="flex flex-col gap-2 border-t border-line-soft px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="w-1 self-stretch rounded bg-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {v.type === "invoice" ? "Rechnung" : "Angebot"} {v.number} ·{" "}
                <Link href={`/firmen/${companyId}`} className="hover:underline">{companyName}</Link>
              </p>
              <p className="text-[13px] text-muted">
                {v.voucherDate?.toLocaleDateString("de-DE")} · brutto {euro(v.totalAmount)} · Gehört sie zu einem dieser Vorgänge?
              </p>
            </div>
            <a href={v.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink" aria-label={`${v.number} in Lexware öffnen`}>
              <ExternalLink size={14} aria-hidden="true" /> Lexware
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-4">
            {deals.map((d) => (
              <button key={d.id} type="button" disabled={pending} onClick={() => run(() => linkVoucherAction(d.id, v.id))} className={btnQuiet}>
                Ja: {d.title} <span className="font-normal text-muted">({STAGE_LABEL[d.stage]})</span>
              </button>
            ))}
            <button type="button" disabled={pending} onClick={() => run(() => dealFromVoucherAction(v.id))} className={btnQuiet}>
              Eigener Vorgang
            </button>
            <button type="button" disabled={pending} onClick={() => run(() => archiveVoucherAction(v.id))} className="text-[13px] text-muted hover:text-ink">
              Gehört zu keinem Vorgang
            </button>
          </div>
        </li>
      ))}
      {error && <li className="px-5 pb-3"><FormError message={error} /></li>}
    </ul>
  );
}
