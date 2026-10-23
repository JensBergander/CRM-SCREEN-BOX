import Link from "next/link";
import { Plus } from "lucide-react";
import { listCompanies, primaryContacts, serviceTags } from "@/lib/queries";
import { serviceTagOptions } from "@/lib/service-tags";
import { ContactActions } from "@/components/contact-actions";
import { SearchBox } from "@/components/search-box";
import { btnPrimary, Card, Empty, PageHeader } from "@/components/ui";

export default async function ServicesPage({ searchParams }: PageProps<"/dienstleister">) {
  const { q, gewerk } = await searchParams;
  const query = typeof q === "string" && q.trim() ? q.trim() : undefined;
  const tag = typeof gewerk === "string" && gewerk ? gewerk : undefined;
  const [rows, used, options] = await Promise.all([listCompanies(query, "dienstleister", tag), serviceTags(), serviceTagOptions()]);
  // Alle vorgegebenen Gewerke in ihrer Reihenfolge, dazu noch vergebene, die nicht mehr in der Auswahl stehen
  const count = new Map(used.map((u) => [u.tag, u.n]));
  const tags = [...options, ...used.map((u) => u.tag).filter((t) => !options.includes(t))].map((t) => ({ tag: t, n: count.get(t) ?? 0 }));
  const people = await primaryContacts(rows.map((r) => r.id));

  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-ink bg-ink text-surface" : "border-line bg-surface"}`;
  const href = (t?: string) => {
    const p = new URLSearchParams({ ...(t && { gewerk: t }), ...(query && { q: query }) }).toString();
    return p ? `/dienstleister?${p}` : "/dienstleister";
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dienstleister" sub="Sprecher, Fotografen und andere, die du bei Bedarf anfragst">
        <SearchBox defaultValue={query} placeholder="Name, Gewerk oder Notiz" keep={{ gewerk: tag }} />
        <Link href="/firmen/neu?art=dienstleister" className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Neuer Dienstleister
        </Link>
      </PageHeader>

      {tags.length > 0 && (
        <nav aria-label="Nach Gewerk filtern" className="flex flex-wrap gap-2">
          <Link href={href()} className={chip(!tag)}>Alle</Link>
          {tags.map((t) => (
            <Link key={t.tag} href={href(t.tag)} className={chip(tag === t.tag)} aria-current={tag === t.tag ? "page" : undefined}>
              {t.tag} <span className="opacity-60">{t.n}</span>
            </Link>
          ))}
        </nav>
      )}

      <Card>
        {rows.length === 0 && (
          <Empty>
            {query || tag
              ? "Niemand gefunden."
              : "Noch keine Dienstleister. Im Posteingang bei „Zuordnen“ „Dienstleister“ wählen oder oben neu anlegen."}
          </Empty>
        )}
        <ul>
          {rows.map((r) => {
            const person = people.get(r.id);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft px-5 py-3.5 first:border-t-0">
                <div className="min-w-0 flex-[1_1_260px]">
                  <Link href={`/firmen/${r.id}`} className="text-sm font-semibold hover:underline">{r.name}</Link>
                  {person && person.name !== r.name && <span className="ml-2 text-xs text-muted">{person.name}</span>}
                  {r.notes && <p className="truncate text-xs text-muted">{r.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(r.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                    <Link key={t} href={href(t)} className="rounded-md bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info-ink">{t}</Link>
                  ))}
                </div>
                <ContactActions name={r.name} phone={person?.phone ?? r.phone} email={person?.email ?? r.email} />
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
