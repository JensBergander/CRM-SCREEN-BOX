import Link from "next/link";
import { notFound } from "next/navigation";
import { dateDe, euro, todayIso } from "@/lib/format";
import { LOST_REASON_LABEL, STAGE_LABEL } from "@/lib/labels";
import { getDeal } from "@/lib/queries";
import { ActivityForm, EditDealForm, StageControl, TaskForm } from "@/components/forms";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { Badge, Card } from "@/components/ui";

export default async function DealPage({ params }: PageProps<"/vorgaenge/[id]">) {
  const { id } = await params;
  const data = await getDeal(Number(id));
  if (!data) notFound();
  const { deal } = data;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-[13px] text-muted">
          <Link href={`/firmen/${deal.companyId}`} className="font-semibold text-ink hover:underline">{data.companyName}</Link>
          {deal.number && <> · Nr. {deal.number}</>}
          {deal.projectDate && <> · {dateDe(deal.projectDate)}</>}
        </p>
        <h1 className="text-[28px] font-bold tracking-tight">{deal.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={deal.stage === "erledigt" ? "accent" : deal.stage === "bezahlt" ? "ok" : "neutral"}>
            {STAGE_LABEL[deal.stage]}
          </Badge>
          <span className="text-sm font-semibold tabular-nums">{euro(deal.amountNet)}</span>
          {deal.compareOnly && <Badge tone="info">Vermutlich Vergleichsangebot</Badge>}
          {deal.quick && <Badge>Schnellauftrag</Badge>}
          {deal.stage === "verloren" && deal.lostReason && (
            <span className="text-sm text-muted">Grund: {LOST_REASON_LABEL[deal.lostReason]}{deal.lostNote && ` – ${deal.lostNote}`}</span>
          )}
        </div>
      </header>

      <Card className="px-5 py-5">
        <StageControl deal={deal} />
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-5">
        <div className="flex flex-col gap-5">
          <Card title="Aufgaben">
            <TaskList tasks={data.tasks} today={todayIso()} empty="Keine Aufgaben zu diesem Vorgang." />
            <TaskForm companyId={deal.companyId} dealId={deal.id} />
          </Card>
          <Card title="Verlauf">
            <ActivityForm companyId={deal.companyId} dealId={deal.id} />
            <Timeline items={data.timeline} />
          </Card>
        </div>
        <Card title="Details">
          <EditDealForm deal={deal} />
        </Card>
      </div>
    </div>
  );
}
