"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { assignAppointmentAction, refreshAppointmentsAction, reviewAppointmentAction } from "@/app/(app)/actions";
import { addDaysIso } from "@/lib/format";
import { btnPrimary, btnQuiet, FormError, Input, Select, Textarea } from "./ui";

// Beim Öffnen der Startseite: gespeicherte Termine stehen schon da, der Kalender wird im Hintergrund neu gelesen
export function AppointmentsRefresh({ stale }: { stale: boolean }) {
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (!stale || done.current) return;
    done.current = true;
    refreshAppointmentsAction().then((r) => {
      if (r.changed) router.refresh();
    });
  }, [stale, router]);
  return null;
}

// Kundentermin ohne Treffer: Firma von Hand wählen (Name aus der Liste)
export function AssignCompany({ eventId, companies }: { eventId: number; companies: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const listId = useId();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
        Firma zuordnen
      </button>
    );
  }
  const save = () => {
    const company = companies.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!company) return setError("Bitte eine Firma aus der Liste wählen.");
    setError(undefined);
    start(() => assignAppointmentAction(eventId, company.id));
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="min-w-0 flex-[1_1_200px]">
        <span className="sr-only">Firma</span>
        <Input
          list={listId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
          placeholder="Firma suchen"
          autoFocus
        />
      </label>
      <datalist id={listId}>
        {companies.map((c) => (
          <option key={c.id} value={c.name.trim()} />
        ))}
      </datalist>
      <button type="button" disabled={pending} onClick={save} className={btnPrimary}>{pending ? "Ordnet zu …" : "Zuordnen"}</button>
      <button type="button" disabled={pending} onClick={() => setOpen(false)} className={btnQuiet}>Abbrechen</button>
      {error && <FormError message={error} />}
    </div>
  );
}

type ReviewProps = {
  id: number;
  title: string;
  when: string;
  projects: { id: number; title: string }[];
  today: string;
};

// „Wie war der Call?“: Notiz (landet am Termin in der Zeitleiste), Nachfassen am … oder nichts weiter
export function AppointmentReview({ id, title, when, projects, today }: ReviewProps) {
  const [mode, setMode] = useState<"ask" | "note" | "follow">("ask");
  const [state, action, pending] = useActionState(reviewAppointmentAction.bind(null, id), undefined);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <span className="font-semibold">{title}</span>
        <span className="block text-muted">{when} · Wie war es? Was ist der nächste Schritt?</span>
      </p>
      {mode === "ask" && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Nachbereiten: ${title}`}>
          <button type="button" onClick={() => setMode("note")} className={btnQuiet}>Notiz schreiben</button>
          <button type="button" onClick={() => setMode("follow")} className={btnQuiet}>Nachfassen am …</button>
          <form action={action} className="ml-auto">
            <button type="submit" disabled={pending} className={btnQuiet}>Nichts weiter</button>
          </form>
        </div>
      )}
      {mode === "note" && (
        <form action={action} className="flex flex-col gap-2.5 rounded-xl bg-bg p-3">
          <label>
            <span className="sr-only">Notiz zum Termin</span>
            <Textarea name="note" rows={4} required autoFocus placeholder="Worum ging es, was wurde vereinbart?" className="resize-y bg-surface" />
          </label>
          <div className="flex flex-wrap gap-2.5">
            {projects.length > 0 && (
              <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 text-xs text-muted">
                Vorgang (optional)
                <Select name="dealId" defaultValue="" className="bg-surface">
                  <option value="">Nur Firma</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </Select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted">
              Nachfassen am (optional)
              <Input type="date" name="followUp" min={today} className="w-auto bg-surface" />
            </label>
          </div>
          <FormError message={state?.error} />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Speichern"}</button>
            <button type="button" disabled={pending} onClick={() => setMode("ask")} className={btnQuiet}>Abbrechen</button>
          </div>
        </form>
      )}
      {mode === "follow" && (
        <form action={action} className="flex flex-wrap items-end gap-2 rounded-xl bg-bg p-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Nachfassen am
            <Input type="date" name="followUp" required min={today} defaultValue={addDaysIso(today, 7)} autoFocus className="w-auto bg-surface" />
          </label>
          <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Aufgabe anlegen"}</button>
          <button type="button" disabled={pending} onClick={() => setMode("ask")} className={btnQuiet}>Abbrechen</button>
          <FormError message={state?.error} />
        </form>
      )}
    </div>
  );
}
