import { COMPANY_KINDS } from "@/db/schema";
import { serviceTagOptions } from "@/lib/service-tags";
import { NewCompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";

export default async function NewCompanyPage({ searchParams }: PageProps<"/firmen/neu">) {
  const { art } = await searchParams;
  const kind = COMPANY_KINDS.find((k) => k === art) ?? "kunde";
  const title = { kunde: "Neue Firma", lieferant: "Neuer Lieferant", wettbewerber: "Neuer Wettbewerber" }[kind];
  return (
    <div className="flex flex-col gap-6">
      <BackButton fallback={`/${({ kunde: "firmen", lieferant: "lieferanten", wettbewerber: "wettbewerber" } as const)[kind]}`} label={title} />
      <PageHeader area={({ kunde: "firmen", lieferant: "lieferanten", wettbewerber: "wettbewerber" } as const)[kind]} title={title} />
      <NewCompanyForm kind={kind} tagOptions={await serviceTagOptions()} />
    </div>
  );
}
