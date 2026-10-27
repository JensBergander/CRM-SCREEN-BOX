import { COMPANY_KINDS } from "@/db/schema";
import { allTagOptions } from "@/lib/service-tags";
import { NewCompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/ui";

export default async function NewCompanyPage({ searchParams }: PageProps<"/firmen/neu">) {
  const { art } = await searchParams;
  const kind = COMPANY_KINDS.find((k) => k === art) ?? "kunde";
  const title = { kunde: "Neue Firma", dienstleister: "Neuer Dienstleister", lieferant: "Neuer Lieferant", wettbewerber: "Neuer Wettbewerber" }[kind];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader area={({ kunde: "firmen", dienstleister: "dienstleister", lieferant: "lieferanten", wettbewerber: "wettbewerber" } as const)[kind]} title={title} />
      <NewCompanyForm kind={kind} tagOptions={await allTagOptions()} />
    </div>
  );
}
