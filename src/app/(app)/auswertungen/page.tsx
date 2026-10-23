import { Card, Empty, PageHeader } from "@/components/ui";

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Auswertungen" />
      <Card>
        <Empty>Kommt in Stufe 4: Quote je Firma, Anteil Vergleichsangebote, Absagegründe und Umsatz.</Empty>
      </Card>
    </div>
  );
}
