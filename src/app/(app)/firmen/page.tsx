import Link from "next/link";
import { ArrowDown, Plus } from "lucide-react";
import { dateDe, euro } from "@/lib/format";
import { listCompanies } from "@/lib/queries";
import { ratingsForAll } from "@/lib/rating";
import { ContactActions } from "@/components/contact-actions";
import { Stars } from "@/components/rating";
import { SearchBox } from "@/components/search-box";
import { btnPrimary, LexwareBadge, PageHeader } from "@/components/ui";

const FILTERS = { alle: "Alle", gut: "ab 4 Sterne", vorsicht: "0 bis 2 Sterne", offen: "nicht bewertet" } as const;
type Filter = keyof typeof FILTERS;

export default async function CompaniesPage({ searchParams }: PageProps<"/firmen">) {
  const { q, sterne, sort } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const filter: Filter = sterne === "gut" || sterne === "vorsicht" || sterne === "offen" ? sterne : "alle";
  const byStars = sort === "sterne";
  const [list, ratings] = await Promise.all([listCompanies(query), ratingsForAll()]);

  const rows = list
    .map((c) => ({ ...c, rating: ratings.get(c.id)?.rating ?? null, revenue: ratings.get(c.id)?.facts.revenue ?? 0 }))
    .filter((c) => {
      const s = c.rating?.stars ?? null;
      if (filter === "gut") return s !== null && s >= 4;
      if (filter === "vorsicht") return s !== null && s <= 2;
      if (filter === "offen") return s === null;
      return true;
    });
  if (byStars) rows.sort((a, b) => (b.rating?.stars ?? -1) - (a.rating?.stars ?? -1) || b.revenue - a.revenue);

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(
      Object.entries({ q: query, sterne: filter === "alle" ? undefined : filter, sort: byStars ? "sterne" : undefined, ...patch }).filter(
        (e): e is [string, string] => !!e[1],
      ),
    ).toString();
    return p ? `/firmen?${p}` : "/firmen";
  };
  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-ink bg-ink text-surface" : "border-line bg-surface"}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader area="firmen" title="Firmen" sub={`${rows.length} ${query || filter !== "alle" ? "Treffer" : "Kunden"}`}>
        <SearchBox defaultValue={query} placeholder="Name oder Ort" keep={{ sterne: filter === "alle" ? undefined : filter, sort: byStars ? "sterne" : undefined }} />
        <Link href="/firmen/neu" className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Neue Firma
        </Link>
      </PageHeader>

      <nav aria-label="Nach Einschätzung filtern" className="flex flex-wrap gap-2">
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <Link key={f} href={href({ sterne: f === "alle" ? undefined : f })} className={chip(filter === f)} aria-current={filter === f ? "page" : undefined}>
            {FILTERS[f]}
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-2xl bg-surface">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Firma</th>
              <th className="px-3 py-3 font-medium">
                <Link href={href({ sort: byStars ? undefined : "sterne" })} className={`inline-flex items-center gap-1 hover:text-ink ${byStars ? "text-ink" : ""}`}>
                  Einschätzung {byStars && <ArrowDown size={12} aria-hidden="true" />}
                </Link>
              </th>
              <th className="px-3 py-3 font-medium">Ort</th>
              <th className="px-3 py-3 text-right font-medium">Umsatz</th>
              <th className="px-3 py-3 font-medium">Letzte Bewegung</th>
              <th className="px-5 py-3 font-medium"><span className="sr-only">Anrufen oder schreiben</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-line-soft hover:bg-bg/60">
                <td className="px-5 py-3">
                  <Link href={`/firmen/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                  <span className="ml-2"><LexwareBadge company={c} /></span>
                </td>
                <td className="px-3 py-3">
                  {c.rating?.stars !== null && c.rating?.stars !== undefined ? (
                    <Stars value={c.rating.stars} suggested={!c.rating.manual} />
                  ) : (
                    <span className="text-xs text-muted">–</span>
                  )}
                </td>
                <td className="px-3 py-3 text-muted">{c.city ?? "–"}</td>
                <td className="px-3 py-3 text-right tabular-nums text-muted">{c.revenue > 0 ? euro(c.revenue) : "–"}</td>
                <td className="px-3 py-3 text-muted">{c.lastChange ? dateDe(new Date(c.lastChange).toISOString()) : "–"}</td>
                <td className="px-5 py-2">
                  <ContactActions name={c.name} phone={c.phone} email={c.email} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-muted">
                  {query || filter !== "alle" ? "Keine Firma gefunden." : (
                    <>Noch keine Firmen. Unter <Link href="/einstellungen" className="underline">Einstellungen</Link> kannst du deine Kunden aus Lexware importieren.</>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
