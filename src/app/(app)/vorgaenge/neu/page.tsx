import { todayIso } from "@/lib/format";
import { companyOptions, getMail } from "@/lib/queries";
import { DealForm } from "@/components/deal-form";
import { PageHeader } from "@/components/ui";

export default async function NewDealPage({ searchParams }: PageProps<"/vorgaenge/neu">) {
  const params = await searchParams;
  const quick = params.schnell === "1";
  const [companies, mailRow] = await Promise.all([
    companyOptions(),
    params.mail ? getMail(Number(params.mail)) : Promise.resolve(null),
  ]);
  const presetId = mailRow?.mail.companyId ? String(mailRow.mail.companyId) : params.firma;
  const preset = companies.find((c) => String(c.id) === presetId) ?? null;
  const fromMail = mailRow
    ? { id: mailRow.mail.id, subject: mailRow.mail.subject ?? "", from: mailRow.mail.fromName ?? mailRow.mail.fromAddress ?? "" }
    : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={quick ? "Schnellauftrag" : "Neuer Vorgang"}
        sub={
          fromMail
            ? `Aus der Mail „${fromMail.subject}“ von ${fromMail.from}`
            : quick
              ? "Startet direkt als „Beauftragt“, z. B. nach einem Anruf"
              : "Anfrage, Angebot oder Auftrag erfassen"
        }
      />
      <DealForm companies={companies} preset={preset} quick={quick} today={todayIso()} fromMail={fromMail} />
    </div>
  );
}
