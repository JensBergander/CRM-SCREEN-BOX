import Link from "next/link";
import { euro } from "@/lib/format";
import { LOST_REASON_LABEL } from "@/lib/labels";
import { crmReport, lexwareReport, type Period } from "@/lib/reports";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

const PERIODS: Record<Period, string> = { "12m": "Letzte 12 Monate", jahr: "Dieses Jahr", alles: "Alles" };

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-surface p-5">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)} %`);

export default async function ReportsPage({ searchParams }: PageProps<"/auswertungen">) {
  const { zeitraum } = await searchParams;
  const period: Period = zeitraum === "jahr" || zeitraum === "alles" ? zeitraum : "12m";
  const [lx, crm] = await Promise.all([lexwareReport(period), crmReport(period)]);
  const maxMonth = Math.max(1, ...lx.months.map((m) => m.value));
  const maxReason = Math.max(1, ...crm.reasons.map((r) => r.count));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Auswertungen">
        <div role="group" aria-label="Zeitraum" className="flex rounded-full bg-line p-1">
          {Object.entries(PERIODS).map(([key, label]) => (
            <Link
              key={key}
              href={key === "12m" ? "/auswertungen" : `/auswertungen?zeitraum=${key}`}
              aria-current={period === key ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-full px-4 text-[13px] font-semibold ${period === key ? "bg-surface shadow-sm" : "text-muted"}`}
            >
              {label}
            </Link>
          ))}
        </div>
      </PageHeader>

      <h2 className="-mb-2 text-lg font-bold">Aus Lexware</h2>
      <section aria-label="Kennzahlen Lexware" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Stat label="Umsatz netto" value={euro(lx.totals.revenue)} hint={`${lx.totals.invoices} Rechnungen`} />
        <Stat label="Angebote geschrieben" value={String(lx.totals.offers)} hint={`${lx.totals.openOffers} noch offen`} />
        <Stat label="Annahmequote" value={pct(lx.totals.acceptRate)} hint="angenommen von entschiedenen Angeboten" />
        <Stat
          label="Ø Rechnung"
          value={lx.totals.invoices ? euro(lx.totals.revenue / lx.totals.invoices) : "–"}
          hint="netto je Rechnung"
        />
      </section>

      <Card title="Umsatz je Monat (netto)">
        <div className="px-5 pb-4 pt-2">
          <div className="flex h-48 items-end gap-0.5" role="list" aria-label="Umsatz je Monat">
            {lx.months.map((m) => (
              <div key={m.key} role="listitem" className="group relative flex h-full flex-1 flex-col justify-end" tabIndex={0} aria-label={`${m.label}: ${euro(m.value)}`}>
                <div
                  className="w-full rounded-t-[4px] bg-ink group-hover:opacity-80 group-focus:opacity-80"
                  style={{ height: `${(m.value / maxMonth) * 100}%`, minHeight: m.value > 0 ? 2 : 0 }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-surface group-hover:block group-focus:block">
                  {m.label}: {euro(m.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-0.5 border-t border-line pt-1.5">
            {lx.months.map((m, i) => (
              <span key={m.key} className="flex-1 text-center text-[10px] text-muted">
                {lx.months.length <= 14 || i % 3 === 0 ? m.label : ""}
              </span>
            ))}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-[13px] text-muted">Als Tabelle</summary>
            <table className="mt-2 w-full max-w-sm text-sm">
              <tbody>
                {lx.months.map((m) => (
                  <tr key={m.key} className="border-t border-line-soft">
                    <td className="py-1.5">{m.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{euro(m.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </Card>

      <Card
        title="Angebote je Kunde"
        aside={<span className="text-xs text-muted">„Nimmt selten an“: ab 3 Angeboten, unter einem Drittel angenommen</span>}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium">Kunde</th>
                <th className="px-3 py-2 text-right font-medium">Angebote</th>
                <th className="px-3 py-2 text-right font-medium">angenommen</th>
                <th className="px-3 py-2 text-right font-medium">abgelehnt</th>
                <th className="px-3 py-2 text-right font-medium">offen</th>
                <th className="px-5 py-2 text-right font-medium">Umsatz netto</th>
              </tr>
            </thead>
            <tbody>
              {lx.customers.slice(0, 40).map((c) => {
                const decided = c.accepted + c.rejected;
                const rare = c.offers >= 3 && decided > 0 && c.accepted / decided < 1 / 3;
                return (
                  <tr key={c.contactId || c.name} className="border-t border-line-soft">
                    <td className="px-5 py-2.5">
                      {c.companyId ? <Link href={`/firmen/${c.companyId}`} className="font-semibold hover:underline">{c.name}</Link> : <span className="font-semibold">{c.name}</span>}
                      {rare && <span className="ml-2"><Badge tone="info">nimmt selten an</Badge></span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.offers}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.accepted}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.rejected}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{c.open}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{euro(c.revenue)}</td>
                  </tr>
                );
              })}
              {lx.customers.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-6 text-muted">Keine Belege in diesem Zeitraum.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="-mb-2 mt-2 text-lg font-bold">Aus dem CRM</h2>
      <section aria-label="Kennzahlen CRM" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Stat label="Vorgänge" value={String(crm.requests)} hint={`${crm.quick} davon Schnellaufträge`} />
        <Stat label="Beauftragt" value={String(crm.won)} hint={crm.requests ? `${Math.round((crm.won / crm.requests) * 100)} % der Vorgänge` : undefined} />
        <Stat label="Verloren" value={String(crm.lost)} />
        <Stat label="Vergleichsangebote" value={String(crm.compare)} hint="markiert oder als Grund angegeben" />
      </section>

      <Card title="Absagegründe">
        {crm.lost === 0 ? (
          <Empty>Noch keine verlorenen Vorgänge in diesem Zeitraum.</Empty>
        ) : (
          <ul className="flex flex-col gap-2.5 px-5 pb-5 pt-2">
            {crm.reasons.map((r) => (
              <li key={r.reason} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 text-muted">{LOST_REASON_LABEL[r.reason]}</span>
                <span className="h-3 flex-1 rounded-r-[4px] bg-line-soft">
                  <span className="block h-3 rounded-r-[4px] bg-ink" style={{ width: `${(r.count / maxReason) * 100}%` }} />
                </span>
                <span className="w-8 text-right font-semibold tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
