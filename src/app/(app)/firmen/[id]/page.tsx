import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, Plus } from "lucide-react";
import { dateDe, euro, todayIso } from "@/lib/format";
import { STAGE_DOT, STAGE_LABEL } from "@/lib/labels";
import { getCompany } from "@/lib/queries";
import { serviceTagOptions } from "@/lib/service-tags";
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

  const quote = stats.requests ? Math.round((stats.won / stats.requests) * 100) : 0;
  const kpis = [
    { label: "Anfragen gesamt", value: String(stats.requests) },
    { label: "davon beauftragt", value: stats.requests ? `${stats.won} · ${quote} %` : "–" },
    { label: "Umsatz (abgerechnet)", value: euro(stats.revenue) },
    { label: "Vergleichsangebote", value: String(stats.compare), hot: stats.compare > 0 },
    { label: "Letzter Kontakt", value: stats.lastContact ? dateDe(new Date(stats.lastContact).toISOString()) : "–" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <p className="text-[13px] text-muted">
            {[company.city, company.customerNumber && `Kd.-Nr. ${company.customerNumber}`, company.folderName && `Ordner ${company.folderName}`]
              .filter(Boolean)
              .join(" · ") || "Firma"}
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">{company.name}</h1>
          {company.kind === "dienstleister" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Link href="/dienstleister" className="rounded-md bg-line-soft px-2 py-0.5 text-[11px] font-semibold">Dienstleister</Link>
              {(company.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                <Link key={t} href={`/dienstleister?gewerk=${encodeURIComponent(t)}`} className="rounded-md bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info-ink">{t}</Link>
              ))}
            </div>
          )}
        </div>
        {(company.phone || company.email) && (
          <ContactActions name={company.name} phone={company.phone} email={company.email} />
        )}
        <Link href={`/vorgaenge/neu?firma=${company.id}`} className={btnSecondary}>Neuer Vorgang</Link>
        <Link href={`/vorgaenge/neu?schnell=1&firma=${company.id}`} className={btnPrimary}>
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Schnellauftrag
        </Link>
      </header>

      <section aria-label="Kennzahlen" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl bg-surface p-4">
            <p className="text-xs text-muted">{k.label}</p>
            <p className={`mt-1 text-xl font-bold tracking-tight ${k.hot ? "text-info-ink" : ""}`}>{k.value}</p>
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
          <EditCompanyForm company={company} tagOptions={await serviceTagOptions()} />
        </div>
      </details>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card title="Zeitleiste">
          <ActivityForm companyId={company.id} dealId={null} />
          <Timeline items={data.timeline} emails={data.emails} searchable />
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="Vorgänge">
            {data.deals.length === 0 && <Empty>Noch keine Vorgänge.</Empty>}
            {data.deals.map((d) => (
              <Row key={d.id} href={`/vorgaenge/${d.id}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[d.stage]}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.title}</p>
                  <p className="text-xs text-muted">{STAGE_LABEL[d.stage]}{d.number && ` · ${d.number}`}</p>
                </div>
                {d.compareOnly && <Badge tone="info">Vergleich?</Badge>}
                <span className="text-[13px] tabular-nums">{euro(d.amountNet)}</span>
              </Row>
            ))}
          </Card>

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
