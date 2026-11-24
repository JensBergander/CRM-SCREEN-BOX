import Link from "next/link";
import { Plus } from "lucide-react";
import { dateDe, euro, todayIso } from "@/lib/format";
import { STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { BOARD_PAID_DAYS, competitorNames, listDeals, nextShootDays, paidCount } from "@/lib/queries";
import { paymentDues } from "@/lib/payments";
import { STAGES, type Stage } from "@/db/schema";
import { DealBoard } from "@/components/deal-board";
import { SearchBox } from "@/components/search-box";
import { Badge, btnPrimary, PageHeader } from "@/components/ui";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const berlinIso = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

// Auswahl als Linkliste im <details>, damit die Seite ohne JavaScript filtert
function FilterSelect({ label, name, value, options, link }: {
  label: string;
  name: string;
  value: string;
  options: [string, string][];
  link: (patch: Record<string, string | null>) => string;
}) {
  const current = options.find(([v]) => v === value)?.[1] ?? options[0][1];
  return (
    <details className="relative">
      <summary className={`inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 font-medium [&::-webkit-details-marker]:hidden ${value ? "border-ink bg-ink text-surface" : "border-line bg-surface"}`}>
        <span className="sr-only">{label}: </span>{current} <span aria-hidden="true">▾</span>
      </summary>
      <ul className="absolute left-0 z-20 mt-1 min-w-44 rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line">
        {options.map(([v, text]) => (
          <li key={v}>
            <Link href={link({ [name]: v || null })} aria-current={v === value ? "true" : undefined} className={`block rounded-lg px-3 py-2 hover:bg-bg ${v === value ? "font-semibold" : ""}`}>{text}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function DealsPage({ searchParams }: PageProps<"/vorgaenge">) {
  const params = await searchParams;
  const table = params.ansicht === "tabelle";
  const showLost = params.verloren === "1";
  const compareOnly = params.vergleich === "1";

  const phase = STAGES.find((s) => s === params.phase) as Stage | undefined;
  const year = typeof params.jahr === "string" && /^\d{4}$/.test(params.jahr) ? params.jahr : undefined;
  const sort = ["firma", "betrag"].includes(String(params.sort)) ? String(params.sort) : "datum";

  let deals = await listDeals(table && (showLost || phase === "verloren"), { board: !table });
  const competitors = await competitorNames();
  if (compareOnly) deals = deals.filter((d) => d.compareOnly);
  // Tabelle: Phase, Jahr (der letzten Phasenänderung, bei „Bezahlt“ also das Zahlungsjahr) und Sortierung
  const years = [...new Set(deals.map((d) => berlinIso(d.stageChangedAt).slice(0, 4)))].sort().reverse();
  if (table) {
    if (phase) deals = deals.filter((d) => d.stage === phase);
    if (year) deals = deals.filter((d) => berlinIso(d.stageChangedAt).slice(0, 4) === year);
    deals = [...deals].sort((a, b) =>
      sort === "firma"
        ? a.companyName.localeCompare(b.companyName, "de") || b.stageChangedAt.getTime() - a.stageChangedAt.getTime()
        : sort === "betrag"
          ? Number(b.amountNet ?? 0) - Number(a.amountNet ?? 0)
          : b.stageChangedAt.getTime() - a.stageChangedAt.getTime(),
    );
  }
  // Suche über Firma, Vorgang, Projekt-, Angebots- und Rechnungsnummer
  const query = typeof params.q === "string" ? params.q.trim() : "";
  if (query) {
    // jedes Wort muss irgendwo vorkommen, z. B. „Eurowings Messe“
    const words = query.toLowerCase().split(/\s+/);
    deals = deals.filter((d) => {
      const text = [d.companyName, d.title, d.number, d.offerNumber, d.invoiceNumber].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }

  const link = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ansicht: params.ansicht, verloren: params.verloren, vergleich: params.vergleich, phase: params.phase, jahr: params.jahr, sort: params.sort, q: query, ...patch })) {
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
      <PageHeader area="vorgaenge" title="Vorgänge" sub={query ? `${deals.length} Treffer für „${query}“` : undefined}>
        <SearchBox
          defaultValue={query}
          placeholder="Firma, Vorgang oder Nummer"
          keep={{ ansicht: str(params.ansicht), verloren: str(params.verloren), vergleich: str(params.vergleich) }}
        />
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

      {!table && (
        <DealBoard
          deals={deals}
          competitors={competitors}
          today={todayIso()}
          payments={Object.fromEntries([...(await paymentDues(deals.filter((d) => d.stage === "rechnung").map((d) => d.id)))].map(([id, p]) => [id, { expected: p.expected, mismatch: p.mismatch }]))}
          shoots={Object.fromEntries(await nextShootDays(deals.filter((d) => d.stage === "beauftragt").map((d) => d.id)))}
          paid={{ total: await paidCount(), days: BOARD_PAID_DAYS, href: link({ ansicht: "tabelle", phase: "bezahlt", vergleich: null }) }}
        />
      )}

      {table && (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <FilterSelect label="Phase" name="phase" value={phase ?? ""} options={[["", "Alle Phasen"], ...STAGES.filter((s) => s !== "verloren" || showLost).map((s) => [s, STAGE_LABEL[s]] as [string, string])]} link={link} />
          <FilterSelect label="Jahr" name="jahr" value={year ?? ""} options={[["", "Alle Jahre"], ...years.map((y) => [y, y] as [string, string])]} link={link} />
          <FilterSelect label="Sortieren" name="sort" value={sort === "datum" ? "" : sort} options={[["", "Neueste zuerst"], ["firma", "Nach Firma"], ["betrag", "Nach Betrag"]]} link={link} />
        </div>
      )}

      {table && (
        <div className="relative overflow-x-auto rounded-2xl bg-surface">
          <table className="w-full text-sm md:min-w-[760px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Firma · Vorgang</th>
                <th className="hidden md:table-cell px-3 py-3 font-medium">Phase</th>
                <th className="hidden md:table-cell px-3 py-3 text-right font-medium">Betrag</th>
                <th className="hidden md:table-cell px-3 py-3 font-medium">Projektdatum</th>
                <th className="hidden md:table-cell px-5 py-3 font-medium">{phase === "bezahlt" ? "Bezahlt am" : "Phase seit"}</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-t border-line-soft hover:bg-bg/60">
                  <td className="px-5 py-3">
                    <Link href={`/vorgaenge/${d.id}`} className="block">
                      <span className="font-semibold">{d.companyName}</span>
                      <span className="block text-[13px] text-muted">{d.title}</span>
                      {/* Handy: Phase, Betrag und Datum in der ersten Spalte statt rechts außerhalb */}
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted md:hidden">
                        <span className={`h-2 w-2 rounded-full ${STAGE_DOT[d.stage]}`} aria-hidden="true" />
                        <span className="font-semibold text-ink">{STAGE_LABEL[d.stage]}</span>
                        {Number(d.amountNet) > 0 && <span className="tabular-nums">{euro(d.amountNet)}</span>}
                        {d.projectDate && <span>{dateDe(d.projectDate)}</span>}
                        <span>seit {dateDe(berlinIso(d.stageChangedAt))}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${STAGE_DOT[d.stage]}`} />
                      {STAGE_LABEL[d.stage]}
                      {d.compareOnly && <Badge tone="info">Vergleich?</Badge>}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums md:table-cell">{euro(d.amountNet)}</td>
                  <td className="hidden px-3 py-3 md:table-cell">{dateDe(d.projectDate)}</td>
                  <td className="hidden px-5 py-3 md:table-cell">{dateDe(berlinIso(d.stageChangedAt))}</td>
                </tr>
              ))}
              {deals.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-6 text-muted">{query ? `Nichts gefunden für „${query}“.` : "Noch keine Vorgänge."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
