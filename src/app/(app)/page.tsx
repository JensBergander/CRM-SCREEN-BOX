import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { MapPin } from "lucide-react";
import { addDaysIso, ageLabel, daysSince, euro, mapsUrl, todayIso } from "@/lib/format";
import { upcomingProductionDays } from "@/lib/schedule";
import { getDashboard } from "@/lib/queries";
import { TaskList } from "@/components/task-list";
import { Badge, btnQuiet, Card, Empty, PageHeader, Row } from "@/components/ui";
import { advanceDealAction } from "./actions";

function greeting(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", { hour: "numeric", timeZone: "Europe/Berlin" }).format(date),
  );
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Hallo";
  return "Guten Abend";
}

export default async function StartPage() {
  const [user, data, upcoming] = await Promise.all([getCurrentUser(), getDashboard(), upcomingProductionDays(todayIso(), addDaysIso(todayIso(), 14))]);
  const now = new Date();
  const today = new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Berlin",
  }).format(now);
  const billingSum = data.billing.reduce((s, d) => s + Number(d.amountNet ?? 0), 0);
  const oldestBilling = data.billing[0] ? daysSince(data.billing[0].stageChangedAt) : null;

  const kpis = [
    {
      label: "Offen zur Abrechnung",
      value: String(data.billing.length),
      hint: oldestBilling !== null ? `ältester ${ageLabel(oldestBilling)} erledigt` : "erledigt, noch keine Rechnung",
      dot: "bg-accent",
      hot: data.billing.length > 0,
    },
    { label: "Angebote nachfassen", value: String(data.followUps.length), hint: "über 10 Tage ohne Antwort", dot: "bg-[#91CCF4]" },
    { label: "Laufende Projekte", value: String(data.beauftragt), hint: "in Phase Beauftragt", dot: "bg-ok" },
    { label: "Offene Angebote", value: euro(data.offers.total ?? 0), hint: `${data.offers.n} Angebote verschickt`, dot: "bg-[#C7C7CC]" },
  ];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={`${greeting(now)}, ${user.name.split(" ")[0]}`} sub={today}>
        <Link href="/vorgaenge/neu" className="inline-flex min-h-11 items-center rounded-full border border-ink px-5 text-sm font-semibold">
          Neuer Vorgang
        </Link>
      </PageHeader>

      <section aria-label="Kennzahlen" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex flex-col gap-1.5 rounded-2xl bg-surface p-5">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <span className={`h-2 w-2 rounded-full ${kpi.dot}`} />
              {kpi.label}
            </div>
            <div className={`text-3xl font-bold tracking-tight ${kpi.hot ? "text-accent-ink" : ""}`}>{kpi.value}</div>
            <div className="text-xs text-muted">{kpi.hint}</div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-5">
        <Card
          title="Offen zur Abrechnung"
          aside={data.billing.length > 0 && <Badge tone="accent">{data.billing.length} · {euro(billingSum)}</Badge>}
        >
          {data.billing.length === 0 && <Empty>Nichts offen. Alles abgerechnet.</Empty>}
          {data.billing.map((deal) => {
            const days = daysSince(deal.stageChangedAt);
            return (
              <div key={deal.id} className="flex items-center gap-3.5 border-t border-line-soft px-5 py-3.5">
                <span className={`w-1 self-stretch rounded ${days >= 7 ? "bg-accent" : "bg-accent-soft"}`} />
                <Link href={`/vorgaenge/${deal.id}`} className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{deal.companyName}</p>
                  <p className="truncate text-[13px] text-muted">{deal.title} · {euro(deal.amountNet)}</p>
                </Link>
                <span className={`whitespace-nowrap text-xs font-semibold ${days >= 7 ? "text-accent-ink" : "text-muted"}`}>
                  {ageLabel(days)}
                </span>
                <form action={advanceDealAction.bind(null, deal.id, "rechnung")}>
                  <button type="submit" className={btnQuiet}>Rechnung erfasst</button>
                </form>
              </div>
            );
          })}
        </Card>

        <Card title="Nächste Produktionstage" aside={<Link href="/planung" className="text-[13px] text-muted">Planung</Link>}>
          {upcoming.length === 0 && <Empty>In den nächsten 14 Tagen ist keine Produktion geplant.</Empty>}
          {upcoming.map((p, i) => (
            <div key={`${p.dealId}-${p.day}-${i}`} className="relative">
            <Row href={`/vorgaenge/${p.dealId}`}>
              <div className="w-14 shrink-0 text-center">
                <p className="text-[11px] font-semibold uppercase text-muted">
                  {new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${p.day}T12:00:00Z`))}
                </p>
                <p className="text-lg font-bold leading-tight">{p.day.slice(8)}.{p.day.slice(5, 7)}.</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.company} · {p.title}</p>
                <p className="truncate text-[13px] text-muted">{p.startTime}–{p.endTime}{p.location && ` · ${p.location}`}</p>
              </div>
              {!!Number(p.hasMap) && <span className="w-10 shrink-0" />}
            </Row>
            {/* Route außerhalb des Zeilenlinks, weil Links nicht verschachtelt sein dürfen */}
            {!!Number(p.hasMap) && p.location && (
              <a href={mapsUrl(p.location)} target="_blank" rel="noreferrer" aria-label={`Route zu ${p.location}`} title="In Google Maps öffnen" className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
                <MapPin size={17} aria-hidden="true" />
              </a>
            )}
            </div>
          ))}
        </Card>

        <Card title="Heute zu tun" aside={<Link href="/aufgaben" className="text-[13px] text-muted">Alle Aufgaben</Link>}>
          <TaskList tasks={data.todayTasks} today={todayIso()} empty="Keine Aufgaben für heute." />
        </Card>

        <Card title="Angebote nachfassen" aside={<span className="text-xs text-muted">ohne Rückmeldung seit über 10 Tagen</span>}>
          {data.followUps.length === 0 && <Empty>Keine Angebote, die auf Antwort warten.</Empty>}
          {data.followUps.map((deal) => (
            <Row key={deal.id} href={`/vorgaenge/${deal.id}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{deal.companyName}</p>
                <p className="truncate text-[13px] text-muted">{deal.title} · {euro(deal.amountNet)}</p>
              </div>
              {deal.compareOnly && <Badge tone="info">Vergleichsangebot?</Badge>}
              <span className="whitespace-nowrap text-xs text-muted">{daysSince(deal.stageChangedAt)} Tage</span>
            </Row>
          ))}
        </Card>

        <Card
          title="Neue Mails ohne Zuordnung"
          aside={<Link href="/posteingang" className="text-[13px] text-muted">Posteingang</Link>}
        >
          {data.mails.length === 0 && <Empty>Keine offenen Mails.</Empty>}
          {data.mails.map(({ mail }) => (
            <Row key={mail.id} href="/posteingang">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-[13px] font-semibold text-muted">
                {(mail.fromName ?? mail.fromAddress ?? "?").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{mail.fromName ?? mail.fromAddress}</p>
                <p className="truncate text-[13px] text-muted">{mail.subject || "(ohne Betreff)"}</p>
              </div>
            </Row>
          ))}
        </Card>
      </div>
    </div>
  );
}
