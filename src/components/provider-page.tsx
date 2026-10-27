import Link from "next/link";
import { Plus } from "lucide-react";
import { listCompanies, primaryContacts, serviceTags } from "@/lib/queries";
import { serviceTagOptions } from "@/lib/service-tags";
import { KIND_TONE, TONE_SOFT } from "@/lib/tones";
import { ContactActions } from "@/components/contact-actions";
import { SearchBox } from "@/components/search-box";
import { btnPrimary, Card, Empty, LexwareBadge, PageHeader } from "@/components/ui";

const t = {
  path: "/lieferanten",
  param: "kategorie",
  title: "Lieferanten",
  sub: "Alle, die dir Rechnungen schreiben: Verleih, Technik, Sprecher, Übersetzer und andere",
  search: "Name, Kategorie oder Notiz",
  add: "Neuer Lieferant",
  filter: "Nach Kategorie filtern",
  empty: "Noch keine Lieferanten. Lieferanten aus Lexware holst du unter Einstellungen mit „Jetzt mit Lexware abgleichen“, sonst oben neu anlegen.",
};

// Liste der Lieferanten mit Pill-Filter nach Kategorie, Suche und Kontaktknöpfen
export async function ProviderPage({ params }: { params: Record<string, string | string[] | undefined> }) {
  const kind = "lieferant";
  const q = params.q;
  const filterValue = params[t.param];
  const query = typeof q === "string" && q.trim() ? q.trim() : undefined;
  const tag = typeof filterValue === "string" && filterValue ? filterValue : undefined;
  const [rows, used, options] = await Promise.all([listCompanies(query, kind, tag), serviceTags(), serviceTagOptions()]);
  // Alle vorgegebenen Kategorien in ihrer Reihenfolge, dazu noch vergebene, die nicht mehr in der Auswahl stehen
  const count = new Map(used.map((u) => [u.tag, u.n]));
  const tags = [...options, ...used.map((u) => u.tag).filter((t) => !options.includes(t))].map((t) => ({ tag: t, n: count.get(t) ?? 0 }));
  const people = await primaryContacts(rows.map((r) => r.id));

  const chip = (on: boolean) =>
    `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium ${on ? "border-ink bg-ink text-surface" : "border-line bg-surface"}`;
  const href = (tg?: string) => {
    const p = new URLSearchParams({ ...(tg && { [t.param]: tg }), ...(query && { q: query }) }).toString();
    return p ? `${t.path}?${p}` : t.path;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader area="lieferanten" title={t.title} sub={t.sub}>
        <SearchBox defaultValue={query} placeholder={t.search} keep={{ [t.param]: tag }} />
        <Link href={`/firmen/neu?art=${kind}`} className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          {t.add}
        </Link>
      </PageHeader>

      {tags.length > 0 && (
        <nav aria-label={t.filter} className="flex flex-wrap gap-2">
          <Link href={href()} className={chip(!tag)}>Alle</Link>
          {tags.map((x) => (
            <Link key={x.tag} href={href(x.tag)} className={chip(tag === x.tag)} aria-current={tag === x.tag ? "page" : undefined}>
              {x.tag} <span className="opacity-60">{x.n}</span>
            </Link>
          ))}
        </nav>
      )}

      <Card>
        {rows.length === 0 && (
          <Empty>
            {query || tag
              ? "Niemand gefunden."
              : t.empty}
          </Empty>
        )}
        <ul>
          {rows.map((r) => {
            const person = people.get(r.id);
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft px-5 py-3.5 first:border-t-0">
                <div className="min-w-0 flex-[1_1_260px]">
                  <Link href={`/firmen/${r.id}`} className="text-sm font-semibold hover:underline">{r.name}</Link>
                  <span className="ml-2"><LexwareBadge company={r} /></span>
                  {person && person.name !== r.name && <span className="ml-2 text-xs text-muted">{person.name}</span>}
                  {r.notes && <p className="truncate text-xs text-muted">{r.notes}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(r.tags ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => (
                    <Link key={x} href={href(x)} className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE_SOFT[KIND_TONE[kind]]}`}>{x}</Link>
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
