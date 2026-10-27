import Link from "next/link";
import { notFound } from "next/navigation";
import { dateDe, euro, todayIso } from "@/lib/format";
import { LOST_REASON_LABEL, STAGE_LABEL } from "@/lib/labels";
import { FolderPlus } from "lucide-react";
import { folderLink } from "@/lib/folders";
import { companyName, competitorNames, getDeal, supplierNames, suppliersForDeal, vouchersForDeal } from "@/lib/queries";
import { RatingHint } from "@/components/rating-hint";
import { InlineTitle } from "@/components/inline-title";
import { loadPlanningAction, renameDealAction } from "../../actions";
import { AutoPlanningDialog, PlanningForm } from "@/components/planning";
import { LexwareVouchers } from "@/components/lexware-vouchers";
import { QuotationDraft } from "@/components/quotation-draft";
import { ActivityForm, CompetitorForm, EditDealForm, StageControl, TaskForm } from "@/components/forms";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { SupplierCard } from "@/components/suppliers";
import { Badge, btnSecondary, Card, LexwareBadge } from "@/components/ui";
import { STAGE_TONE } from "@/lib/tones";

export default async function DealPage({ params, searchParams }: PageProps<"/vorgaenge/[id]">) {
  const { id } = await params;
  const { planen } = await searchParams;
  const data = await getDeal(Number(id));
  if (!data) notFound();
  const { deal } = data;
  const vouchers = await vouchersForDeal(deal);
  const planning = await loadPlanningAction(deal.id);
  const competitors = await competitorNames();
  const competitor = deal.competitorId ? await companyName(deal.competitorId) : null;
  const folder = data.folderName ? await folderLink(deal, data.folderName) : null;
  const [suppliers, supplierOptions] = await Promise.all([suppliersForDeal(deal.id), supplierNames()]);

  return (
    <div className="flex flex-col gap-6">
      {planen === "1" && <AutoPlanningDialog dealId={deal.id} title={`${data.companyName} · ${deal.title}`} />}
      {!["verloren", "bezahlt"].includes(deal.stage) && <RatingHint companyId={deal.companyId} />}
      <header className="flex flex-col gap-2">
        <p className="text-[13px] text-muted">
          <Link href={`/firmen/${deal.companyId}`} className="font-semibold text-ink hover:underline">{data.companyName}</Link>{" "}
          <LexwareBadge company={data.lexware} />
          {deal.number && <> · Nr. {deal.number}</>}
          {deal.projectDate && <> · {dateDe(deal.projectDate)}</>}
        </p>
        <InlineTitle value={deal.title} label="Projektname" onSave={renameDealAction.bind(null, deal.id)} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STAGE_TONE[deal.stage]}>
            {STAGE_LABEL[deal.stage]}
          </Badge>
          <span className="text-sm font-semibold tabular-nums">{euro(deal.amountNet)}</span>
          {deal.compareOnly && <Badge tone="info">Vermutlich Vergleichsangebot</Badge>}
          {deal.quick && <Badge>Schnellauftrag</Badge>}
          {deal.fromLexware && <Badge>aus Lexware</Badge>}
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
            <Timeline items={data.timeline} emails={data.emails} senders={data.senders} searchable projects={data.projects} today={todayIso()} />
          </Card>
        </div>
        <div className="flex flex-col gap-5">
          {planning && ["beauftragt", "erledigt", "rechnung", "bezahlt"].includes(deal.stage) && (
            <Card title="Termine">
              <div className="px-5 pb-5 pt-2">
                <PlanningForm key={JSON.stringify(planning)} dealId={deal.id} initial={planning} />
              </div>
            </Card>
          )}
          <Card title="Lieferanten">
            <SupplierCard dealId={deal.id} amountNet={deal.amountNet} rows={suppliers} options={supplierOptions} />
          </Card>
          <Card title="Lexware">
            <LexwareVouchers dealId={deal.id} {...vouchers} />
            {vouchers.hasLexware && !deal.offerNumber && ["anfrage", "angebot"].includes(deal.stage) && (
              <QuotationDraft dealId={deal.id} title={deal.title} amountNet={deal.amountNet} />
            )}
          </Card>
          <Card title="Details">
            <EditDealForm key={deal.title} deal={deal} />
          </Card>
        </div>
      </div>
    </div>
  );
}
