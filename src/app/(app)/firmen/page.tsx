import Link from "next/link";
import { Plus } from "lucide-react";
import { dateDe } from "@/lib/format";
import { listCompanies } from "@/lib/queries";
import { SearchBox } from "@/components/search-box";
import { btnPrimary, PageHeader } from "@/components/ui";

export default async function CompaniesPage({ searchParams }: PageProps<"/firmen">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const companies = await listCompanies(query);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Firmen" sub={`${companies.length} ${query ? "Treffer" : "Firmen"}`}>
        <SearchBox defaultValue={query} placeholder="Name, Ort oder Domain" />
        <Link href="/firmen/neu" className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Neue Firma
        </Link>
      </PageHeader>

      <div className="overflow-x-auto rounded-2xl bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Firma</th>
              <th className="px-3 py-3 font-medium">Ort</th>
              <th className="px-3 py-3 font-medium">Mail-Domain</th>
              <th className="px-3 py-3 text-right font-medium">Vorgänge</th>
              <th className="px-5 py-3 font-medium">Letzte Bewegung</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-t border-line-soft hover:bg-bg/60">
                <td className="px-5 py-3">
                  <Link href={`/firmen/${c.id}`} className="font-semibold hover:underline">{c.name}</Link>
                  {c.customerNumber && <span className="ml-2 text-xs text-muted">Kd.-Nr. {c.customerNumber}</span>}
                </td>
                <td className="px-3 py-3 text-muted">{c.city ?? "–"}</td>
                <td className="px-3 py-3 text-muted">{c.emailDomain ?? "–"}</td>
                <td className="px-3 py-3 text-right tabular-nums">{c.deals}</td>
                <td className="px-5 py-3 text-muted">{c.lastChange ? dateDe(new Date(c.lastChange).toISOString()) : "–"}</td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-muted">
                  {query ? "Keine Firma gefunden." : (
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
