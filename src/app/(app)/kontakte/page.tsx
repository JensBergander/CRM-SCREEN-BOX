import Link from "next/link";
import { Plus } from "lucide-react";
import { callContexts, listContacts, personCall } from "@/lib/queries";
import { fullName } from "@/lib/people";
import { ContactActions } from "@/components/contact-actions";
import { SearchBox } from "@/components/search-box";
import { btnPrimary, LexwareBadge, PageHeader } from "@/components/ui";

export default async function ContactsPage({ searchParams }: PageProps<"/kontakte">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const rows = await listContacts(query);
  const calls = await callContexts(rows.flatMap((r) => r.links.map((l) => l.contact.companyId)).filter((id): id is number => !!id));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader area="kontakte" title="Kontakte" sub={`${rows.length} ${query ? "Treffer" : "Kontakte"}`}>
        <SearchBox defaultValue={query} placeholder="Name, Mail oder Firma" />
        <Link href="/kontakte/neu" className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Neuer Kontakt
        </Link>
      </PageHeader>
      <div className="relative overflow-x-auto rounded-2xl bg-surface">
        <table className="w-full text-sm md:min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="hidden md:table-cell px-3 py-3 font-medium">Firma</th>
              <th className="hidden md:table-cell px-3 py-3 font-medium">Telefon</th>
              <th className="hidden md:table-cell px-3 py-3 font-medium">E-Mail</th>
              <th className="px-5 py-3 font-medium"><span className="sr-only">Anrufen oder schreiben</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ person, links }) => {
              const name = fullName(person);
              const active = links.filter((l) => !l.contact.endedAt);
              // Telefon und Mail über die erste aktuelle Firma (deren übrige Nummern stehen darunter im Menü)
              const main = active[0]?.contact ?? links[0]?.contact;
              const phone = active.map((l) => l.contact.phone).find(Boolean);
              const email = active.map((l) => l.contact.email).find(Boolean) ?? links.map((l) => l.contact.email).find(Boolean);
              const position = active.map((l) => l.contact.position).find(Boolean);
              return (
                <tr key={person.id} className="border-t border-line-soft hover:bg-bg/60">
                  <td className="px-5 py-3">
                    <Link href={`/kontakte/${person.id}`} className="inline-block py-1 font-semibold hover:underline">{name}</Link>
                    {position && <span className="block text-xs font-normal text-muted">{position}</span>}
                    {/* Handy: Firma unter dem Namen, Anruf und Mail bleiben rechts im Bild */}
                    {active.some((l) => l.companyName) && (
                      <span className="block truncate text-xs text-muted md:hidden">{active.map((l) => l.companyName?.trim()).filter(Boolean).join(", ")}</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">
                    {active.length ? (
                      <span className="flex flex-col gap-1">
                        {active.map((l) =>
                          l.contact.companyId ? (
                            <span key={l.contact.id} className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Link href={`/firmen/${l.contact.companyId}`} className="inline-block py-1 hover:underline">{l.companyName}</Link>
                              {l.lexware && <LexwareBadge company={l.lexware} />}
                            </span>
                          ) : (
                            <span key={l.contact.id} className="text-muted">ohne Firma</span>
                          ),
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">{links.some((l) => l.companyName) ? "nur frühere Firmen" : "–"}</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 whitespace-nowrap text-muted md:table-cell">
                    {phone ?? (person.mobile ? null : "–")}
                    {person.mobile && <span className="block">mobil {person.mobile}</span>}
                  </td>
                  <td className="hidden px-3 py-3 text-muted md:table-cell">{email ?? "–"}</td>
                  <td className="px-3 py-2 md:px-5">
                    {main && (
                      <ContactActions
                        call={personCall(main.companyId ? calls.get(main.companyId) : undefined, { ...main, firstName: person.firstName, lastName: person.lastName, mobile: person.mobile })}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-6 text-muted">Keine Kontakte gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
