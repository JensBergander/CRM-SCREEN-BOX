import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { dateDe, euro, todayIso } from "@/lib/format";
import { LOST_REASON_LABEL, STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { MIN_OFFERS, ratingFor } from "@/lib/rating";
import { AssessmentCard } from "@/components/rating";
import { InlineTitle } from "@/components/inline-title";
import { renameCompanyAction } from "../../actions";
import { companyName, dealsWonBy, getCompany, projectsOfSupplier } from "@/lib/queries";
import { allTagOptions } from "@/lib/service-tags";
import { ContactActions } from "@/components/contact-actions";
import { ActivityForm, ContactForm, EditCompanyForm, TaskForm } from "@/components/forms";
import { TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { Badge, btnPrimary, btnSecondary, Card, Empty, Row } from "@/components/ui";

export default async function CompanyPage({ params }: PageProps<"/firmen/[id]">) {
  const { id } = await params;
  const data = await getCompany(Number(id));
  if (!data) notFound();
  const { company, stats } = data;
  const assessment = await ratingFor(company.id);
  const won = company.kind === "wettbewerber" ? await dealsWonBy(company.id) : [];
  const supplier = company.kind === "lieferant";
  const supplied = supplier ? await projectsOfSupplier(company.id) : [];
  const suppliedCost = supplied.reduce((s, p) => s + Number(p.costNet ?? 0), 0);
  const competitorNames = new Map(
    await Promise.all(
      [...new Set(data.deals.map((d) => d.competitorId).filter((x): x is number => !!x))].map(async (cid) => [cid, (await companyName(cid)) ?? ""] as const),
    ),
  );

  const lastContact = { label: "Letzter Kontakt", value: stats.lastContact ? dateDe(new Date(stats.lastContact).toISOString()) : "–" };
  const kpis = supplier
    ? [{ label: "Projekte", value: String(supplied.length) }, { label: "Kosten in Projekten", value: euro(suppliedCost) }, lastContact]
    : [
        { label: "Umsatz (Lexware)", value: euro(assessment?.facts.revenue ?? 0) },
        { label: "Vorgänge im CRM", value: String(stats.requests) },
        lastContact,
      ];
  const tagLinks = { dienstleister: { href: "/dienstleister", param: "gewerk", label: "Dienstleister" }, lieferant: { href: "/lieferanten", param: "kategorie", label: "Lieferant" } };
  const tagLink = company.kind === "dienstleister" || company.kind === "lieferant" ? tagLinks[company.kind] : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <p className="text-[13px] text-muted">
            {[
              company.city,
              company.customerNumber && `Kd.-Nr. ${company.customerNumber}`,
              company.supplierNumber && `Lief.-Nr. ${company.supplierNumber}`,
              company.folderName && `Ordner ${company.folderName}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Firma"}
          </p>
          <div className="mt-1">
            <InlineTitle value={company.name} label="Firmenname" onSave={renameCompanyAction.bind(null, company.id)} />
          </div>
          {tagLink && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link href={tagLink.href} className="rounded-md bg-line-soft px-2 py-0.5 text-[11px] font-semibold">{tagLink.label}</Link>
              {(company.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                <Link key={t} href={`${tagLink.href}?${tagLink.param}=${encodeURIComponent(t)}`} className="rounded-md bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info-ink">{t}</Link>
              ))}
            </div>
          )}
        </div>
        {(company.phone || company.email) && (
          <ContactActions name={company.name} phone={company.phone} email={company.email} />
        )}
        {!supplier && (
          <>
            <Link href={`/vorgaenge/neu?firma=${company.id}`} className={btnSecondary}>Neuer Vorgang</Link>
            <Link href={`/vorgaenge/neu?schnell=1&firma=${company.id}`} className={btnPrimary}>
              <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
              Schnellauftrag
            </Link>
          </>
        )}
      </header>

      <section aria-label="Kennzahlen" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl bg-surface p-4">
            <p className="text-xs text-muted">{k.label}</p>
            <p className="mt-1 text-xl font-bold tracking-tight">{k.value}</p>
          </div>
        ))}
      </section>

      <details className="group rounded-2xl bg-surface">
        <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-base font-semibold">Stammdaten</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
            {[
              [company.street, [company.zip, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
              company.phone,
              company.website,
              company.emailDomain && `@${company.emailDomain}`,
              company.folderName && `Ordner ${company.folderName}`,
            ]
              .filter(Boolean)
              .join(" · ") || "noch keine Angaben"}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
            <span className="group-open:hidden">Öffnen</span>
            <span className="hidden group-open:inline">Schließen</span>
            <ChevronDown size={18} className="transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <div className="border-t border-line-soft pt-2">
          <EditCompanyForm key={company.name} company={company} tagOptions={await allTagOptions()} />
        </div>
      </details>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Zeitleiste">
          {/* Lieferanten: Notizen nur zur Firma; Mails ordnest du über die Zeitleiste einem Kundenprojekt zu */}
          <ActivityForm companyId={company.id} dealId={null} projects={supplier ? [] : data.projects.filter((p) => p.active)} />
          <Timeline items={data.timeline} emails={data.emails} senders={data.senders} searchable projects={data.projects} projectFilter today={todayIso()} />
        </Card>

        <div className="flex flex-col gap-5">
          {company.kind === "wettbewerber" ? (
            <Card title="Hat gewonnen bei">
              {won.length === 0 && <Empty>Noch bei keinem verlorenen Vorgang eingetragen.</Empty>}
              {won.map((d) => (
                <Row key={d.id} href={`/vorgaenge/${d.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{d.companyName}</p>
                    <p className="truncate text-xs text-muted">{d.title}{d.lostReason && ` · ${LOST_REASON_LABEL[d.lostReason]}`}</p>
                  </div>
                  <span className="text-[13px] tabular-nums">{euro(d.amountNet)}</span>
                </Row>
              ))}
            </Card>
          ) : supplier ? (
            <Card title="Projekte" aside={supplied.length > 0 && <span className="text-[13px] font-semibold tabular-nums">{euro(suppliedCost)}</span>}>
              {supplied.length === 0 && <Empty>Noch bei keinem Projekt eingetragen. Im Vorgang unter „Lieferanten“ hinzufügen oder eine Mail einem Projekt zuordnen.</Empty>}
              {supplied.map((p) => (
                <Row key={p.dealId} href={`/vorgaenge/${p.dealId}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[p.stage]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.customer} · {p.title}</p>
                    <p className="truncate text-xs text-muted">{[p.number, p.note].filter(Boolean).join(" · ") || STAGE_LABEL[p.stage]}</p>
                  </div>
                  <span className="text-[13px] tabular-nums">{p.costNet !== null ? euro(p.costNet) : "–"}</span>
                </Row>
              ))}
            </Card>
          ) : (
            assessment && (
              <AssessmentCard
                data={{
                  companyId: company.id,
                  ...assessment.rating,
                  ...assessment.facts,
                  lastOrder: assessment.facts.lastOrder ? dateDe(assessment.facts.lastOrder.toISOString()) : null,
                  minOffers: MIN_OFFERS,
                }}
              />
            )
          )}
          {!supplier && <Card title="Vorgänge">
            {data.deals.length === 0 && <Empty>Noch keine Vorgänge.</Empty>}
            {data.deals.map((d) => (
              <Row key={d.id} href={`/vorgaenge/${d.id}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[d.stage]}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.title}</p>
                  <p className="text-xs text-muted">{STAGE_LABEL[d.stage]}{d.number && ` · ${d.number}`}</p>
                  {d.stage === "verloren" && (
                    <p className="mt-1 text-xs text-accent-ink">
                      {[d.lostReason && LOST_REASON_LABEL[d.lostReason], d.competitorId && `an ${competitorNames.get(d.competitorId) ?? "Wettbewerber"}`]
                        .filter(Boolean)
                        .join(" · ")}
                      {d.lostNote && <span className="mt-0.5 block whitespace-pre-line text-ink">{d.lostNote}</span>}
                    </p>
                  )}
                </div>
                {d.compareOnly && <Badge tone="info">Vergleich?</Badge>}
                <span className="text-[13px] tabular-nums">{euro(d.amountNet)}</span>
              </Row>
            ))}
          </Card>}

          <Card title="Kontakte">
            {data.contacts.length === 0 && <Empty>Noch keine Kontakte.</Empty>}
            {data.contacts.map((c) => {
              const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
              return (
                <Row key={c.id}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="truncate text-xs text-muted">
                      {[c.position, c.phone, c.mobile && `mobil ${c.mobile}`, c.email].filter(Boolean).join(" · ") || "–"}
                    </p>
                  </div>
                  <ContactActions name={name} phone={c.mobile ?? c.phone} email={c.email} />
                </Row>
              );
            })}
            <ContactForm companyId={company.id} />
          </Card>

          <Card title="Offene Aufgaben">
            <TaskList tasks={data.tasks} today={todayIso()} empty="Keine offenen Aufgaben." />
            <TaskForm companyId={company.id} />
          </Card>
        </div>
      </div>
    </div>
  );
}
