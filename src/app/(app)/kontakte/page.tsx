import Link from "next/link";
import { listContacts } from "@/lib/queries";
import { ContactActions } from "@/components/contact-actions";
import { SearchBox } from "@/components/search-box";
import { PageHeader } from "@/components/ui";

export default async function ContactsPage({ searchParams }: PageProps<"/kontakte">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : undefined;
  const rows = await listContacts(query);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Kontakte" sub={`${rows.length} ${query ? "Treffer" : "Kontakte"}`}>
        <SearchBox defaultValue={query} placeholder="Name, Mail oder Firma" />
      </PageHeader>
      <div className="overflow-x-auto rounded-2xl bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Firma</th>
              <th className="px-3 py-3 font-medium">Telefon</th>
              <th className="px-3 py-3 font-medium">E-Mail</th>
              <th className="px-5 py-3 font-medium"><span className="sr-only">Anrufen oder schreiben</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ contact: c, companyName }) => {
              const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
              return (
                <tr key={c.id} className="border-t border-line-soft">
                  <td className="px-5 py-3 font-semibold">
                    {name}
                    {c.position && <span className="block text-xs font-normal text-muted">{c.position}</span>}
                  </td>
                  <td className="px-3 py-3">
                    {c.companyId ? <Link href={`/firmen/${c.companyId}`} className="hover:underline">{companyName}</Link> : "–"}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted">{c.phone ?? "–"}</td>
                  <td className="px-3 py-3 text-muted">{c.email ?? "–"}</td>
                  <td className="px-5 py-2">
                    <ContactActions name={name} phone={c.phone} email={c.email} />
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
