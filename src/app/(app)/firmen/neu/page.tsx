import { serviceTagOptions } from "@/lib/service-tags";
import { NewCompanyForm } from "@/components/company-form";
import { PageHeader } from "@/components/ui";

export default async function NewCompanyPage({ searchParams }: PageProps<"/firmen/neu">) {
  const { art } = await searchParams;
  const kind = art === "dienstleister" ? "dienstleister" : "kunde";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={kind === "dienstleister" ? "Neuer Dienstleister" : "Neue Firma"} />
      <NewCompanyForm kind={kind} tagOptions={await serviceTagOptions()} />
    </div>
  );
}
