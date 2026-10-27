import Link from "next/link";
import { Plus } from "lucide-react";
import { dateDe, euro } from "@/lib/format";
import { STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { competitorNames, listDeals } from "@/lib/queries";
import { DealBoard } from "@/components/deal-board";
import { Badge, btnPrimary, PageHeader } from "@/components/ui";

export default async function DealsPage({ searchParams }: PageProps<"/vorgaenge">) {
  const params = await searchParams;
  const table = params.ansicht === "tabelle";
  const showLost = params.verloren === "1";
  const compareOnly = params.vergleich === "1";

  let deals = await listDeals(table && showLost);
  const competitors = await competitorNames();
  if (compareOnly) deals = deals.filter((d) => d.compareOnly);

  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ansicht: params.ansicht, verloren: params.verloren, vergleich: params.vergleich, ...patch })) {
      if (typeof v === "string" && v) next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `/vorgaenge?${qs}` : "/vorgaenge";
  };
  const pill = (on: boolean) =>
    `inline-flex min-h-9 items-center rounded-full px-4 text-[13px] font-semibold ${on ? "bg-surface text-ink shadow-sm" : "text-muted"}`;
  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-ink bg-ink text-surface" : "border-line bg-surface"}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader area="vorgaenge" title="Vorgänge">
        <div role="group" aria-label="Ansicht" className="flex rounded-full bg-line p-1">
          <Link href={link({ ansicht: null })} aria-current={!table ? "page" : undefined} className={pill(!table)}>Board</Link>
          <Link href={link({ ansicht: "tabelle" })} aria-current={table ? "page" : undefined} className={pill(table)}>Tabelle</Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={link({ vergleich: compareOnly ? null : "1" })} className={chip(compareOnly)}>Nur Vergleichsangebote</Link>
          {table && <Link href={link({ verloren: showLost ? null : "1" })} className={chip(showLost)}>Verlorene zeigen</Link>}
        </div>
        <Link href="/vorgaenge/neu" className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Neuer Vorgang
        </Link>
      </PageHeader>

      {!table && <DealBoard deals={deals} competitors={competitors} />}

      {table && (
        <div className="overflow-x-auto rounded-2xl bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Nr.</th>
                <th className="px-3 py-3 font-medium">Firma · Vorgang</th>
                <th className="px-3 py-3 font-medium">Phase</th>
                <th className="px-3 py-3 text-right font-medium">Betrag</th>
                <th className="px-5 py-3 font-medium">Projektdatum</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-t border-line-soft hover:bg-bg/60">
                  <td className="px-5 py-3 tabular-nums text-muted">{d.number ?? "–"}</td>
                  <td className="px-3 py-3">
                    <Link href={`/vorgaenge/${d.id}`} className="block">
                      <span className="font-semibold">{d.companyName}</span>
                      <span className="block text-[13px] text-muted">{d.title}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${STAGE_DOT[d.stage]}`} />
                      {STAGE_LABEL[d.stage]}
                      {d.compareOnly && <Badge tone="info">Vergleich?</Badge>}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{euro(d.amountNet)}</td>
                  <td className="px-5 py-3">{dateDe(d.projectDate)}</td>
                </tr>
              ))}
              {deals.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-muted">Noch keine Vorgänge.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
