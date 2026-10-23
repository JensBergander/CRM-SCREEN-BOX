import Link from "next/link";
import { notFound } from "next/navigation";
import { dateDe, euro, todayIso } from "@/lib/format";
import { LOST_REASON_LABEL, STAGE_LABEL } from "@/lib/labels";
import { FolderPlus } from "lucide-react";
import { folderLink } from "@/lib/folders";
import { companyName, competitorNames, getDeal, vouchersForDeal } from "@/lib/queries";
import { RatingHint } from "@/components/rating-hint";
import { LexwareVouchers } from "@/components/lexware-vouchers";
import { QuotationDraft } from "@/components/quotation-draft";
import { ActivityForm, CompetitorForm, EditDealForm, StageControl, TaskForm } from "@/components/forms";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { Badge, btnSecondary, Card } from "@/components/ui";

export default async function DealPage({ params }: PageProps<"/vorgaenge/[id]">) {
  const { id } = await params;
  const data = await getDeal(Number(id));
  if (!data) notFound();
  const { deal } = data;
  const vouchers = await vouchersForDeal(deal);
  const competitors = await competitorNames();
  const competitor = deal.competitorId ? await companyName(deal.competitorId) : null;
  const folder = data.folderName ? await folderLink(deal, data.folderName) : null;

  return (
    <div className="flex flex-col gap-6">
      {!["verloren", "bezahlt"].includes(deal.stage) && <RatingHint companyId={deal.companyId} />}
      <header className="flex flex-col gap-2">
        <p className="text-[13px] text-muted">
          <Link href={`/firmen/${deal.companyId}`} className="font-semibold text-ink hover:underline">{data.companyName}</Link>
          {deal.number && <> · Nr. {deal.number}</>}
          {deal.projectDate && <> · {dateDe(deal.projectDate)}</>}
        </p>
        <h1 className="text-[28px] font-bold tracking-tight">{deal.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={deal.stage === "erledigt" ? "accent" : "neutral"}>
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

      {deal.stage === "verloren" && (
        <Card className="flex flex-col gap-2 px-5 py-4">
          <CompetitorForm dealId={deal.id} current={competitor} competitors={competitors} />
          {competitor && deal.competitorId && (
            <Link href={`/firmen/${deal.competitorId}`} className="text-[13px] text-muted underline">Zur Seite von {competitor}</Link>
          )}
        </Card>
      )}

      <Card className="flex flex-wrap items-start justify-between gap-4 px-5 py-5">
        <StageControl deal={deal} competitors={competitors} />
        {folder ? (
          <div className="flex flex-col items-start gap-1">
            <a href={folder.href} className={btnSecondary}>
              <FolderPlus size={16} aria-hidden="true" />
              Projektordner anlegen
            </a>
            <span className="text-xs text-muted">{data.folderName}/{folder.project}</span>
          </div>
        ) : (
          <Link href={`/firmen/${deal.companyId}`} className="text-[13px] text-muted underline">
            Für Projektordner zuerst den Ordnernamen der Firma eintragen
          </Link>
        )}
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-5">
        <div className="flex flex-col gap-5">
          <Card title="Aufgaben">
            <TaskList tasks={data.tasks} today={todayIso()} empty="Keine Aufgaben zu diesem Vorgang." />
            <TaskForm companyId={deal.companyId} dealId={deal.id} />
          </Card>
          <Card title="Verlauf">
            <ActivityForm companyId={deal.companyId} dealId={deal.id} />
            <Timeline items={data.timeline} emails={data.emails} searchable projects={data.projects} today={todayIso()} />
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          <Card title="Lexware">
            <LexwareVouchers dealId={deal.id} {...vouchers} />
            {vouchers.hasLexware && !deal.offerNumber && ["anfrage", "angebot"].includes(deal.stage) && (
              <QuotationDraft dealId={deal.id} title={deal.title} amountNet={deal.amountNet} />
            )}
          </Card>
          <Card title="Details">
            <EditDealForm deal={deal} />
          </Card>
        </div>
      </div>
    </div>
  );
}
