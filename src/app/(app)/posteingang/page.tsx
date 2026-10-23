import { Card, Empty, PageHeader } from "@/components/ui";

export default function InboxPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Posteingang" />
      <Card>
        <Empty>Hier erscheinen in Stufe 2 die Mails aus office@ und hello@, die noch keiner Firma zugeordnet sind.</Empty>
      </Card>
    </div>
  );
}
