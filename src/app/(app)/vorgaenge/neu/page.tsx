import { todayIso } from "@/lib/format";
import { companyOptions, getActivity, getMail } from "@/lib/queries";
import { DealForm } from "@/components/deal-form";
import { RatingHint } from "@/components/rating-hint";
import { PageHeader } from "@/components/ui";

export default async function NewDealPage({ searchParams }: PageProps<"/vorgaenge/neu">) {
  const params = await searchParams;
  const quick = params.schnell === "1";
  const [companies, mailRow, note] = await Promise.all([
    companyOptions(true),
    params.mail ? getMail(Number(params.mail)) : Promise.resolve(null),
    params.notiz ? getActivity(Number(params.notiz)) : Promise.resolve(null),
  ]);
  const presetId = mailRow?.mail.companyId
    ? String(mailRow.mail.companyId)
    : note?.companyId
      ? String(note.companyId)
      : params.firma;
  const preset = companies.find((c) => String(c.id) === presetId) ?? null;
  const fromMail = mailRow
    ? { id: mailRow.mail.id, subject: mailRow.mail.subject ?? "", from: mailRow.mail.fromName ?? mailRow.mail.fromAddress ?? "" }
    : null;
  const fromNote = note ? { id: note.id, title: note.body.split("\n")[0].slice(0, 200) } : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        area="vorgaenge"
        title={quick ? "Schnellauftrag" : "Neuer Vorgang"}
        sub={
          fromMail
            ? `Aus der Mail „${fromMail.subject}“ von ${fromMail.from}`
            : fromNote
              ? `Aus der Notiz „${fromNote.title}“`
              : quick
              ? "Startet direkt als „Beauftragt“, z. B. nach einem Anruf"
              : "Anfrage, Angebot oder Auftrag erfassen"
        }
      />
      {preset && <RatingHint companyId={preset.id} />}
      <DealForm companies={companies} preset={preset} quick={quick} today={todayIso()} fromMail={fromMail} fromNote={fromNote} />
    </div>
  );
}
