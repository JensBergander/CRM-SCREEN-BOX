import { todayIso } from "@/lib/format";
import { companyOptions } from "@/lib/queries";
import { DealForm } from "@/components/deal-form";
import { PageHeader } from "@/components/ui";

export default async function NewDealPage({ searchParams }: PageProps<"/vorgaenge/neu">) {
  const params = await searchParams;
  const quick = params.schnell === "1";
  const companies = await companyOptions();
  const preset = companies.find((c) => String(c.id) === params.firma) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={quick ? "Schnellauftrag" : "Neuer Vorgang"}
        sub={quick ? "Startet direkt als „Beauftragt“, z. B. nach einem Anruf" : "Anfrage, Angebot oder Auftrag erfassen"}
      />
      <DealForm companies={companies} preset={preset} quick={quick} today={todayIso()} />
    </div>
  );
}
