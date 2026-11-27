import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { MapPin } from "lucide-react";
import { addDaysIso, ageLabel, daysSince, euro, mapsUrl, todayIso } from "@/lib/format";
import { upcomingProductionDays } from "@/lib/schedule";
import { competitorNames, getDashboard, pendingVouchers, recentCompanies } from "@/lib/queries";
import { FollowUps } from "@/components/follow-ups";
import { RecentCompanies } from "@/components/recent-companies";
import { lexwareUrl } from "@/lib/lexware-sync";
import { VoucherQuestions } from "@/components/voucher-questions";
import { TaskList } from "@/components/task-list";
import { Badge, btnQuiet, Card, Empty, PageHeader, Row } from "@/components/ui";
import { advanceDealAction } from "./actions";
import { dayLine, greeting } from "@/lib/greeting";
import { incomingForecast } from "@/lib/payments";
import { postQuestions } from "@/lib/post";
import { PostQuestions } from "@/components/post-questions";
import { displayName, firstNameOf } from "@/lib/profile";
import { appointmentsStale, reviewQuestions, upcomingAppointments } from "@/lib/appointments";
import { AppointmentList } from "@/components/appointment-list";
import { ConfirmDealToggle } from "@/components/confirm-deal";
import { STAGE_LABEL } from "@/lib/labels";
import { AppointmentReview, AppointmentsRefresh } from "@/components/appointment-actions";
import { companyOptions } from "@/lib/queries";
import { whenDe } from "@/lib/format";


// „KW 48 · 23.11.–29.11.“
function weekLabel(from: string, to: string) {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `KW ${kw} · ${from.slice(8)}.${from.slice(5, 7)}.–${to.slice(8)}.${to.slice(5, 7)}.`;
}

export default async function StartPage() {
  const [user, data, upcoming, questions, recent, competitors, postOpen, forecast, appointments, reviews, stale, companyList] = await Promise.all([
    getCurrentUser(),
    getDashboard(),
    upcomingProductionDays(todayIso(), addDaysIso(todayIso(), 14)),
    pendingVouchers(),
    recentCompanies(),
    competitorNames(),
    postQuestions(),
    incomingForecast(),
    upcomingAppointments(),
    reviewQuestions(),
    appointmentsStale(),
    companyOptions(),
  ]);
  const forecastMax = Math.max(1, forecast.overdue.sum, ...forecast.weeks.map((w) => w.sum));
  const forecastNet = forecast.overdue.net || forecast.weeks.some((w) => w.net);
  const now = new Date();
  const name = firstNameOf(await displayName(user));
  const sub = dayLine(now, {
    shootingToday: upcoming.filter((d) => String(d.day).slice(0, 10) === todayIso()).length,
    overdue: data.todayTasks.filter((t) => t.dueDate && t.dueDate < todayIso()).length,
    billing: data.billing.length,
  });
  const billingSum = data.billing.reduce((s, d) => s + Number(d.amountNet ?? 0), 0);
  const oldestBilling = data.billing[0] ? daysSince(data.billing[0].stageChangedAt) : null;

  const kpis = [
    {
      label: "Offen zur Abrechnung",
      value: String(data.billing.length),
      hint: oldestBilling !== null ? `ältester ${ageLabel(oldestBilling)} erledigt` : "erledigt, noch keine Rechnung",
      dot: data.billing.length > 0 ? "bg-danger" : "bg-done",
      hot: data.billing.length > 0,
      href: data.billing.length > 0 ? "#abrechnung" : "/vorgaenge",
    },
    { label: "Angebote nachfassen", value: String(data.followUps.length), hint: "ohne Antwort, Frist erreicht", dot: "bg-sales", href: "#nachfassen" },
    { label: "Laufende Projekte", value: String(data.beauftragt), hint: "Beauftragt und in Bearbeitung", dot: "bg-accent", href: "/planung" },
    { label: "Offene Angebote", value: euro(data.offers.total ?? 0), hint: `${data.offers.n} Angebote verschickt`, dot: "bg-sales", href: "/vorgaenge" },
  ];

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title={greeting(now, name)} sub={sub}>
        <Link href="/vorgaenge/neu" className="inline-flex min-h-11 items-center rounded-full border border-ink px-5 text-sm font-semibold">
          Neuer Vorgang
        </Link>
      </PageHeader>

      {/* Handy 2×2, damit „Heute zu tun“ schneller kommt; jede Kachel führt zur passenden Liste */}
      <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:gap-4">
        {kpis.map((kpi) => (
          <Link key={kpi.label} href={kpi.href} className="flex flex-col gap-1 rounded-2xl bg-surface p-4 hover:ring-1 hover:ring-line md:gap-1.5 md:p-5">
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <span className={`h-2 w-2 rounded-full ${kpi.dot}`} />
              {kpi.label}
            </div>
            <div className={`text-2xl font-bold tracking-tight md:text-3xl ${kpi.hot ? "text-danger-ink" : ""}`}>{kpi.value}</div>
            <div className="text-xs text-muted">{kpi.hint}</div>
          </Link>
        ))}
      </section>

      {reviews.length > 0 && (
        <Card title="Wie war der Termin?" aside={<Badge tone="danger">{reviews.length} {reviews.length === 1 ? "Termin" : "Termine"} nachbereiten</Badge>}>
          <ul className="flex flex-col">
            {reviews.map((r) => (
              <li key={r.id} className="border-t border-line-soft px-5 py-4 first:border-t-0">
                <AppointmentReview
                  id={r.id}
                  title={`${r.subject} · ${[r.companyName, r.personName].filter(Boolean).join(", ")}`}
                  when={whenDe(r.startAt, r.allDay)}
                  projects={r.projects}
                  today={todayIso()}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {postOpen.length > 0 && (
        <Card title="Wie lange brauchst du noch?" aside={<Badge tone="danger">{postOpen.length} in Bearbeitung ohne Ende</Badge>}>
          <PostQuestions items={postOpen} today={todayIso()} />
        </Card>
      )}

      {questions.length > 0 && (
        <Card
          title="Belege zuordnen"
          aside={<Badge tone="danger">{questions.length} neu aus Lexware</Badge>}
        >
          <VoucherQuestions
            items={questions.map((q) => ({
              ...q,
              voucher: {
                id: q.voucher.id,
                number: q.voucher.number,
                type: q.voucher.type,
                totalAmount: q.voucher.totalAmount,
                voucherDate: q.voucher.voucherDate,
                url: lexwareUrl(q.voucher),
              },
            }))}
          />
        </Card>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-5">
        <Card title="Termine" aside={<span className="text-xs text-muted">aus Outlook</span>}>
          <AppointmentsRefresh stale={stale} />
          <AppointmentList items={appointments} today={todayIso()} now={now} companies={companyList} />
        </Card>

        {/* leer nur Platz: die Kachel oben zeigt schon „0“ */}
        {data.billing.length > 0 && (
        <Card
          id="abrechnung"
          title="Offen zur Abrechnung"
          aside={<Badge tone="danger">{data.billing.length} · {euro(billingSum)}</Badge>}
        >
          {data.billing.map((deal) => {
            const days = daysSince(deal.stageChangedAt);
            return (
              <div key={deal.id} className="flex items-center gap-3.5 border-t border-line-soft px-5 py-3.5">
                <span className={`w-1 self-stretch rounded ${days >= 7 ? "bg-danger" : "bg-done"}`} />
                <Link href={`/vorgaenge/${deal.id}`} className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{deal.companyName}</p>
                  <p className="truncate text-[13px] text-muted">{deal.title} · {euro(deal.amountNet)}</p>
                </Link>
                <span className={`whitespace-nowrap text-xs font-semibold ${days >= 7 ? "text-danger-ink" : "text-muted"}`}>
                  {ageLabel(days)}
                </span>
                <form action={advanceDealAction.bind(null, deal.id, "rechnung")}>
                  <button type="submit" className={btnQuiet}>Rechnung erfasst</button>
                </form>
              </div>
            );
          })}
        </Card>
        )}

        <Card title="Nächste Produktionstage" aside={<Link href="/planung" className="text-[13px] text-muted">Planung</Link>}>
          {upcoming.length === 0 && <Empty>In den nächsten 14 Tagen ist keine Produktion geplant.</Empty>}
          {upcoming.map((p, i) => {
            // Anfrage/Angebot: nur reserviert (Outlook „Mit Vorbehalt“) – grau gestrichelt; bestätigt – grün umrandet
            const reserved = p.stage === "anfrage" || p.stage === "angebot";
            const map = !!Number(p.hasMap) && !!p.location;
            return (
            <div key={`${p.dealId}-${p.day}-${i}`} className="flex items-center border-t border-line-soft">
            <Link href={`/vorgaenge/${p.dealId}`} className="flex min-w-0 flex-1 items-center gap-3.5 py-3.5 pl-5 pr-2 hover:bg-bg/60">
              <div className={`w-14 shrink-0 rounded-xl border py-0.5 text-center ${reserved ? "border-dashed border-line" : "border-ok bg-ok-soft"}`}>
                <p className={`text-[11px] font-semibold uppercase ${reserved ? "text-muted" : "text-ok-ink"}`}>
                  {new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${p.day}T12:00:00Z`))}
                </p>
                <p className={`text-lg font-bold leading-tight ${reserved ? "text-muted" : "text-ok-ink"}`}>{p.day.slice(8)}.{p.day.slice(5, 7)}.</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{p.company} · {p.title}</p>
                <p className="truncate text-[13px] text-muted">
                  {reserved && <span className="font-semibold">{STAGE_LABEL[p.stage]} · reserviert · </span>}
                  {p.startTime}–{p.endTime}{p.location && ` · ${p.location}`}
                </p>
              </div>
            </Link>
            {/* Schalter und Route neben dem Zeilenlink, weil Links und Knöpfe nicht verschachtelt sein dürfen */}
            <div className="flex shrink-0 items-center gap-1 pr-4">
              <ConfirmDealToggle dealId={p.dealId} reserved={reserved} label={`${p.company} · ${p.title}`} />
              {map && (
                <a href={mapsUrl(p.location!)} target="_blank" rel="noreferrer" aria-label={`Route zu ${p.location}`} title="In Google Maps öffnen" className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
                  <MapPin size={17} aria-hidden="true" />
                </a>
              )}
            </div>
            </div>
            );
          })}
        </Card>

        <Card
          title="Geldeingang erwartet"
          aside={<Link href="/vorgaenge?ansicht=tabelle&phase=rechnung" className="text-[13px] text-muted">Offene Rechnungen</Link>}
        >
          {forecast.overdue.count + forecast.weeks.reduce((s, w) => s + w.count, 0) === 0 ? (
            <Empty>In den nächsten 4 Wochen ist keine Zahlung offen.</Empty>
          ) : (
            <ul className="flex flex-col px-5 pb-4">
              {[
                ...(forecast.overdue.count ? [{ key: "over", label: "Überfällig", ...forecast.overdue, danger: true }] : []),
                ...forecast.weeks.map((w) => ({ key: w.from, label: weekLabel(w.from, w.to), ...w, danger: false })),
              ].map((row) => (
                <li key={row.key} className="flex flex-col gap-1.5 border-t border-line-soft py-3 first:border-t-0">
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className={`flex-1 ${row.danger ? "font-semibold text-danger-ink" : "text-muted"}`}>{row.label}</span>
                    <span className="text-xs text-muted">{row.count ? `${row.count} ${row.count === 1 ? "Rechnung" : "Rechnungen"}` : ""}</span>
                    <span className={`w-24 text-right font-semibold tabular-nums ${row.danger ? "text-danger-ink" : ""}`}>
                      {row.count ? euro(row.sum) : "–"}{row.net && "*"}
                    </span>
                  </div>
                  <span className="h-1.5 rounded-full bg-line-soft" aria-hidden="true">
                    <span className={`block h-full rounded-full ${row.danger ? "bg-danger" : "bg-done"}`} style={{ width: `${(row.sum / forecastMax) * 100}%` }} />
                  </span>
                </li>
              ))}
              <li className="pt-2 text-xs text-muted">
                Nach Fälligkeit, bei Firmen mit Zahlungsziel oder Erfahrungswert nach dem späteren Datum. Beträge brutto laut Lexware
                {forecastNet && "; * enthält Nettobeträge von Rechnungen, die noch nicht in Lexware gefunden wurden"}
                {forecast.later > 0 && `. ${forecast.later} weitere später`}.
              </li>
            </ul>
          )}
        </Card>

        <Card title="Zuletzt aktiv" aside={<span className="text-xs text-muted">Kunden mit Notiz, Anruf oder laufendem Vorgang</span>}>
          <RecentCompanies items={recent} />
        </Card>

        <Card title="Heute zu tun" aside={<Link href="/aufgaben" className="text-[13px] text-muted">Alle Aufgaben</Link>}>
          <TaskList tasks={data.todayTasks} today={todayIso()} empty="Keine Aufgaben für heute." />
        </Card>

        <Card id="nachfassen" title="Angebote nachfassen" aside={<span className="text-xs text-muted">ohne Rückmeldung seit über 10 Tagen oder Frist erreicht</span>}>
          <FollowUps deals={data.followUps} competitors={competitors} today={todayIso()} />
        </Card>

        <Card
          title="Neue Mails ohne Zuordnung"
          aside={<Link href="/posteingang" className="text-[13px] text-muted">Posteingang</Link>}
        >
          {data.mails.length === 0 && <Empty>Keine offenen Mails.</Empty>}
          {data.mails.map(({ mail }) => (
            <Row key={mail.id} href={`/posteingang?mail=${mail.id}`}>
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
