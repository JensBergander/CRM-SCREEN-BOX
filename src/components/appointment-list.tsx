import Link from "next/link";
import { Video } from "lucide-react";
import type { Appointment } from "@/lib/appointments";
import { addDaysIso, dayDe, timeDe } from "@/lib/format";
import { AssignCompany } from "./appointment-actions";
import { btnQuiet, Empty } from "./ui";

const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
const berlinIso = (d: Date) => dayFormat.format(d);

// Startseite: Termine aus Outlook, heute groß, die nächsten Tage kompakt nach Tagen
export function AppointmentList({
  items,
  today,
  now,
  companies,
}: {
  items: Appointment[];
  today: string;
  now: Date;
  companies: { id: number; name: string }[];
}) {
  // Mehrtägige Termine, die schon laufen, stehen unter heute
  const groups = new Map<string, Appointment[]>([[today, []]]);
  for (const a of items) {
    const day = berlinIso(a.startAt) < today ? today : berlinIso(a.startAt);
    groups.set(day, [...(groups.get(day) ?? []), a]);
  }
  const tomorrow = addDaysIso(today, 1);
  return (
    <div className="flex flex-col pb-2">
      {[...groups].map(([day, list]) => {
        const isToday = day === today;
        const label = isToday ? "Heute" : day === tomorrow ? "Morgen" : dayDe(new Date(`${day}T12:00:00Z`));
        return (
          <section key={day} aria-label={label}>
            <h3 className={`px-5 pb-1 pt-3 text-xs font-semibold ${isToday ? "text-ink" : "text-muted"}`}>
              {label}
              {(isToday || day === tomorrow) && <span className="font-normal text-muted"> · {dayDe(new Date(`${day}T12:00:00Z`))}</span>}
            </h3>
            {list.length === 0 && <Empty>Heute keine Termine.</Empty>}
            <ul>
              {list.map((a) => (
                <AppointmentRow key={a.id} a={a} big={isToday} now={now} companies={companies} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AppointmentRow({ a, big, now, companies }: { a: Appointment; big: boolean; now: Date; companies: { id: number; name: string }[] }) {
  const running = a.startAt <= now && a.endAt > now;
  const past = a.endAt <= now;
  // Ort nur anzeigen, wenn er keine Adresse eines Online-Termins ist
  const place = a.location && !/^https?:\/\//.test(a.location) ? a.location : null;
  // Eigener Produktionstermin: bei Anfrage/Angebot nur reserviert (grau), ab Beauftragt bestätigt (grün)
  const reserved = a.dealStage === "anfrage" || a.dealStage === "angebot";
  const who = a.dealId ? null : [a.companyName, a.personName].filter(Boolean).join(" · ");
  return (
    <li
      className={`flex items-start gap-3.5 border-t border-line-soft px-5 ${big ? "py-3.5" : "py-2.5"} ${running ? "bg-info-soft/60" : ""} ${past ? "opacity-60" : ""}`}
    >
      {/* Eigene Produktionstermine wie in „Nächste Produktionstage“: grau gestrichelt = reserviert, grün = bestätigt */}
      <div
        className={`-my-0.5 shrink-0 rounded-xl border px-1.5 py-0.5 tabular-nums ${big ? "w-16" : "w-14"} ${
          !(a.dealId && a.dealStage) ? "border-transparent" : reserved ? "border-dashed border-line text-muted" : "border-ok bg-ok-soft text-ok-ink"
        }`}
      >
        {a.allDay ? (
          <p className="text-xs font-semibold text-muted">ganztägig</p>
        ) : (
          <>
            <p className={`${big ? "text-[15px]" : "text-sm"} font-semibold`}>{timeDe(a.startAt)}</p>
            {big && <p className="text-xs text-muted">bis {timeDe(a.endAt)}</p>}
          </>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${big ? "text-[15px]" : "text-sm"}`}>
          {a.dealId ? (
            <Link href={`/vorgaenge/${a.dealId}`} className={`hover:underline ${reserved ? "text-muted" : "text-ok-ink"}`}>
              <span
                className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${reserved ? "border border-dashed border-muted" : "bg-ok"}`}
                aria-hidden="true"
              />
              {a.subject}
            </Link>
          ) : (
            a.subject
          )}
        </p>
        <p className="truncate text-[13px] text-muted">
          {running && <span className="mr-1.5 font-semibold text-info-ink">läuft gerade</span>}
          {a.companyId && (
            <Link href={`/firmen/${a.companyId}`} className="font-semibold text-ink hover:underline">{a.companyName}</Link>
          )}
          {a.personId && (
            <>
              {a.companyId && " · "}
              <Link href={`/kontakte/${a.personId}`} className="hover:underline">{a.personName}</Link>
            </>
          )}
          {place && <>{(who || running) && " · "}{place}</>}
        </p>
        {!a.dealId && !a.companyId && !past && a.attendees.length > 0 && (
          <p className="truncate text-xs text-muted">mit {a.attendees.map((p) => p.name ?? p.email).join(", ")}</p>
        )}
        {!a.dealId && !a.companyId && <AssignCompany eventId={a.id} companies={companies} />}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {a.joinUrl && !past && (
          <a href={a.joinUrl} target="_blank" rel="noreferrer" className={btnQuiet} aria-label={`${a.subject}: beitreten`}>
            <Video size={14} aria-hidden="true" /> Beitreten
          </a>
        )}
      </div>
    </li>
  );
}
