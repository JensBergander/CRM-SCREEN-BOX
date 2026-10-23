import Link from "next/link";
import { Plus } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, deals } from "@/db/schema";
import { euro } from "@/lib/format";
import { btnPrimary, Card, Empty, PageHeader } from "@/components/ui";

export default async function CompetitorsPage() {
  const [list, lost] = await Promise.all([
    db.select({ id: companies.id, name: companies.name, notes: companies.notes, website: companies.website }).from(companies).where(eq(companies.kind, "wettbewerber")).orderBy(asc(companies.name)),
    db
      .select({ competitorId: deals.competitorId, amountNet: deals.amountNet, companyId: deals.companyId, customer: companies.name })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(eq(deals.stage, "verloren")),
  ]);

  const rows = list
    .map((c) => {
      const won = lost.filter((d) => d.competitorId === c.id);
      const customers = [...new Map(won.map((d) => [d.companyId, d.customer])).entries()];
      return { ...c, wins: won.length, value: won.reduce((s, d) => s + Number(d.amountNet ?? 0), 0), customers };
    })
    .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  const unknown = lost.filter((d) => !d.competitorId).length;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Wettbewerber" sub={`${rows.length} erfasst · ${unknown} verlorene Vorgänge ohne bekannten Wettbewerber`}>
        <Link href="/firmen/neu?art=wettbewerber" className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Neuer Wettbewerber
        </Link>
      </PageHeader>

      <Card>
        {rows.length === 0 && (
          <Empty>Noch keine Wettbewerber. Sie entstehen, wenn du bei einem verlorenen Vorgang einträgst, wer den Auftrag bekommen hat.</Empty>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-5 py-3 font-medium">Wettbewerber</th>
                  <th className="px-3 py-3 text-right font-medium">Gegen dich gewonnen</th>
                  <th className="px-3 py-3 text-right font-medium">Auftragswert</th>
                  <th className="px-5 py-3 font-medium">Bei</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-line-soft align-top">
                    <td className="px-5 py-3">
                      <Link href={`/firmen/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                      {c.notes && <span className="block truncate text-xs text-muted">{c.notes}</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{c.wins}×</td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.value > 0 ? euro(c.value) : "–"}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {c.customers.map(([id, name]) => (
                          <Link key={id} href={`/firmen/${id}`} className="rounded-md bg-line-soft px-2 py-0.5 text-[12px] font-medium hover:bg-line">{name}</Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
