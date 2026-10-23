import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysIso, dateDe, mapsUrl, todayIso } from "@/lib/format";
import { scheduleBetween } from "@/lib/schedule";
import { Card, Empty, PageHeader } from "@/components/ui";

const WEEKS = 8;
const DAY_W = 28; // Breite einer Tagesspalte in px

function mondayOf(iso: string) {
  const wd = new Date(`${iso}T12:00:00Z`).getUTCDay() || 7;
  return addDaysIso(iso, 1 - wd);
}

function isoWeek(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export default async function PlanningPage({ searchParams }: PageProps<"/planung">) {
  const { ab } = await searchParams;
  const today = todayIso();
  const start = mondayOf(typeof ab === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ab) ? ab : today);
  const end = addDaysIso(start, WEEKS * 7 - 1);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDaysIso(start, i));
  const rows = await scheduleBetween(start, end);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Planung" sub={`${dateDe(start)} bis ${dateDe(end)} · Produktion dunkel, Postproduktion hell`}>
        <div className="flex items-center gap-1">
          <Link href={`/planung?ab=${addDaysIso(start, -28)}`} aria-label="4 Wochen zurück" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-line">
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <Link href="/planung" className="inline-flex min-h-10 items-center rounded-full bg-surface px-4 text-[13px] font-semibold hover:bg-line">Heute</Link>
          <Link href={`/planung?ab=${addDaysIso(start, 28)}`} aria-label="4 Wochen vor" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-line">
            <ChevronRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </PageHeader>

      <Card>
        {rows.length === 0 ? (
          <Empty>In diesem Zeitraum sind keine Produktionen oder Postproduktionen geplant.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 240 + days.length * DAY_W }}>
              {/* Kopf: Kalenderwochen und Tage */}
              <div className="flex border-b border-line-soft text-[11px] text-muted">
                <div className="sticky left-0 z-10 w-60 shrink-0 bg-surface px-5 py-2 font-semibold">Projekt</div>
                {days.map((d) => {
                  const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
                  return (
                    <div key={d} style={{ width: DAY_W }} className={`shrink-0 py-1 text-center ${wd === 0 || wd === 6 ? "bg-bg" : ""} ${d === today ? "font-bold text-accent-ink" : ""}`}>
                      {wd === 1 && <div className="font-semibold text-ink">KW{isoWeek(d)}</div>}
                      {wd !== 1 && <div>&nbsp;</div>}
                      <div>{Number(d.slice(8))}</div>
                    </div>
                  );
                })}
              </div>
              {rows.map((r) => (
                <div key={r.dealId} className="flex border-b border-line-soft last:border-b-0">
                  <Link href={`/vorgaenge/${r.dealId}`} className="sticky left-0 z-10 w-60 shrink-0 truncate bg-surface px-5 py-2.5 hover:underline">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    <span className="block truncate text-xs text-muted">{r.company}</span>
                  </Link>
                  {days.map((d) => {
                    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
                    const prod = r.days.find((x) => x.day === d);
                    const post = r.postStart && r.postEnd && d >= r.postStart && d <= r.postEnd;
                    const label = prod
                      ? `${dateDe(d)}: Produktion ${prod.startTime}–${prod.endTime}`
                      : post
                        ? `${dateDe(d)}: Postproduktion`
                        : undefined;
                    return (
                      <div
                        key={d}
                        style={{ width: DAY_W }}
                        className={`relative flex shrink-0 items-center justify-center ${wd === 0 || wd === 6 ? "bg-bg" : ""} ${d === today ? "bg-accent-soft/50" : ""}`}
                        title={label}
                        aria-label={label}
                      >
                        {prod && <span className="h-6 w-[22px] rounded-[4px] bg-ink" />}
                        {!prod && post && <span className="h-3 w-full bg-[#91CCF4]" />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {rows.length > 0 && (
        <details className="rounded-2xl bg-surface px-5 py-3 text-sm">
          <summary className="cursor-pointer text-[13px] text-muted">Als Liste</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.dealId}>
                <Link href={`/vorgaenge/${r.dealId}`} className="font-semibold hover:underline">{r.company} · {r.title}</Link>
                <span className="block text-muted">
                  {r.days.map((x) => `${dateDe(x.day)} ${x.startTime}–${x.endTime}`).join(", ") || "keine Produktionstage"}
                  {r.postStart && r.postEnd && ` · Postproduktion ${dateDe(r.postStart)} bis ${dateDe(r.postEnd)}`}
                </span>
                {r.location && (
                  <span className="block text-muted">
                    Drehort:{" "}
                    {r.hasMap ? <a href={mapsUrl(r.location)} target="_blank" rel="noreferrer" className="text-ink underline">{r.location}</a> : r.location}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
