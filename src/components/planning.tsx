"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { loadPlanningAction, savePlanningAction, type Planning } from "@/app/(app)/actions";
import { addDaysIso, dateDe } from "@/lib/format";
import { btnPrimary, btnQuiet, Field, FormError, Input } from "./ui";

type Day = Planning["days"][number];

// Arbeitstage (Mo–Fr) zwischen zwei Daten, beide eingeschlossen
function workdays(from: string, to: string) {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) n++;
  }
  return n;
}

function nextWorkday(iso: string) {
  let d = addDaysIso(iso, 1);
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDaysIso(d, 1);
  return d;
}

const weekday = (iso: string) => new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export function PlanningForm({ dealId, initial, onSaved, onLater }: {
  dealId: number;
  initial: Planning;
  onSaved?: () => void;
  onLater?: () => void;
}) {
  const [location, setLocation] = useState(initial.location);
  const [days, setDays] = useState<Day[]>(initial.days);
  const [block, setBlock] = useState(initial.blockContinuous);
  const lastDay = [...days].sort((a, b) => a.day.localeCompare(b.day)).at(-1)?.day ?? "";
  const [postStart, setPostStart] = useState(initial.postStart ?? "");
  const [postEnd, setPostEnd] = useState(initial.postEnd ?? "");
  const [touchedPostStart, setTouchedPostStart] = useState(!!initial.postStart);
  const [result, setResult] = useState<{ error?: string; calendarError?: string | null; ok?: boolean } | null>(
    initial.calendarError ? { calendarError: initial.calendarError } : null,
  );
  const [pending, startTransition] = useTransition();

  // Postproduktion startet standardmäßig am nächsten Arbeitstag nach dem letzten Drehtag
  const suggestedStart = lastDay ? nextWorkday(lastDay) : "";
  const effectivePostStart = touchedPostStart ? postStart : suggestedStart;

  const update = (i: number, patch: Partial<Day>) => setDays(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const addDay = () => {
    const prev = days.at(-1);
    setDays([
      ...days,
      prev
        ? { day: prev.day ? addDaysIso(prev.day, 1) : "", startTime: prev.startTime, endTime: prev.endTime }
        : { day: "", startTime: "09:00", endTime: "17:00" },
    ]);
  };

  const save = () =>
    startTransition(async () => {
      const r = await savePlanningAction(dealId, {
        location,
        days: days.filter((d) => d.day),
        postStart: effectivePostStart || null,
        postEnd: postEnd || null,
        blockContinuous: block,
      });
      setResult({ ...r, ok: !r.error });
      if (!r.error && !r.calendarError) onSaved?.();
    });

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays size={16} aria-hidden="true" /> Produktion
          <span className="text-xs font-normal text-muted">kommt in den Kalender von office@</span>
        </h3>
        <Field label="Drehort">
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse oder z. B. Studio" />
        </Field>
        <div className="flex flex-col gap-2">
          {days.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <label className="flex items-center gap-2">
                <span className="w-7 text-xs text-muted">{d.day ? weekday(d.day) : ""}</span>
                <span className="sr-only">Datum</span>
                <Input type="date" value={d.day} onChange={(e) => update(i, { day: e.target.value })} className="w-auto" required />
              </label>
              <span className="flex items-center gap-2">
                <label>
                  <span className="sr-only">von</span>
                  <Input type="time" value={d.startTime} onChange={(e) => update(i, { startTime: e.target.value })} className="w-auto" />
                </label>
                <span className="text-muted">–</span>
                <label>
                  <span className="sr-only">bis</span>
                  <Input type="time" value={d.endTime} onChange={(e) => update(i, { endTime: e.target.value })} className="w-auto" />
                </label>
                <button type="button" onClick={() => setDays(days.filter((_, j) => j !== i))} aria-label="Produktionstag entfernen" className="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </span>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={addDay} className={btnQuiet}>
              <Plus size={14} aria-hidden="true" /> {days.length ? "Weiterer Tag" : "Produktionstag"}
            </button>
            {days.length > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="h-5 w-5 accent-ink" />
                Durchgehend blocken (ein Termin vom ersten bis zum letzten Tag)
              </label>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">
          Postproduktion <span className="text-xs font-normal text-muted">nur für deine Planung, nicht im Kalender</span>
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Starttag">
            <Input
              type="date"
              value={effectivePostStart}
              onChange={(e) => {
                setTouchedPostStart(true);
                setPostStart(e.target.value);
              }}
              className="w-auto"
            />
          </Field>
          <Field label="Zieltag">
            <Input type="date" value={postEnd} min={effectivePostStart || undefined} onChange={(e) => setPostEnd(e.target.value)} className="w-auto" />
          </Field>
          {effectivePostStart && postEnd && (
            <span className="pb-3 text-sm text-muted">
              {workdays(effectivePostStart, postEnd)} Arbeitstage · {dateDe(effectivePostStart)} bis {dateDe(postEnd)}
            </span>
          )}
        </div>
      </section>

      {result?.error && <FormError message={result.error} />}
      {result?.calendarError && (
        <FormError message={`Gespeichert, aber der Kalender konnte nicht aktualisiert werden: ${result.calendarError} Die App versucht es automatisch erneut.`} />
      )}
      {result?.ok && !result.calendarError && <p role="status" className="text-sm text-muted">Gespeichert{days.length ? ", Kalender aktualisiert" : ""}.</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Speichern"}</button>
        {onLater && <button type="button" onClick={onLater} className={btnQuiet}>Später</button>}
      </div>
    </div>
  );
}

// „Produktion planen“ als Fenster, z. B. direkt nach dem Verschieben auf „Beauftragt“
export function PlanningDialog({ dealId, title, onClose }: { dealId: number; title: string; onClose: () => void }) {
  const [initial, setInitial] = useState<Planning | null>(null);
  const [, startLoading] = useTransition();
  useEffect(() => {
    startLoading(async () => setInitial(await loadPlanningAction(dealId)));
  }, [dealId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Produktion planen">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-auto rounded-3xl bg-surface p-6">
        <div>
          <h2 className="text-lg font-bold">Produktion planen</h2>
          <p className="text-sm text-muted">{title}</p>
        </div>
        {initial ? <PlanningForm dealId={dealId} initial={initial} onSaved={onClose} onLater={onClose} /> : <p className="text-sm text-muted">Lädt …</p>}
      </div>
    </div>
  );
}

// Öffnet „Produktion planen“ einmal automatisch, z. B. nach dem Anlegen eines Schnellauftrags
export function AutoPlanningDialog({ dealId, title }: { dealId: number; title: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <PlanningDialog
      dealId={dealId}
      title={title}
      onClose={() => {
        setOpen(false);
        window.history.replaceState(null, "", window.location.pathname);
      }}
    />
  );
}
