"use client";

import { useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { linkWebsiteEventAction, ownWebsiteEventAction, setWebsitePublicAction } from "@/app/(app)/actions";
import type { WebsiteEvent } from "@/lib/website";
import { btnQuiet, FormError } from "./ui";

const when = (e: Pick<WebsiteEvent, "startAt" | "endAt">) => {
  const fmt = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}. ${s.slice(11)}`;
  return `${fmt(e.startAt)} bis ${fmt(e.endAt)}`;
};

// Event auf screen-box.de (Treffpunkt /treffen): Status, Rückfrage bei zeitgleichem Event, „öffentlich ankündigen“
export function WebsiteEventPanel(props: {
  dealId: number;
  confirmed: boolean;
  hasDays: boolean;
  eventId: number | null;
  isPublic: boolean;
  candidates: WebsiteEvent[];
  notice: string | null;
  error: string | null;
  adminUrl: string;
}) {
  const { dealId, confirmed, hasDays, eventId, candidates } = props;
  const [pending, startTransition] = useTransition();

  return (
    <section className="flex flex-col gap-3 border-t border-line-soft px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Event auf der Website</h3>
        {eventId && (
          <a href={props.adminUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
            <ExternalLink size={14} aria-hidden="true" /> screen-box.de/admin/events
          </a>
        )}
      </div>
      <p className="text-sm text-muted">
        {eventId
          ? "Steht auf der Website. Zeitraum und Ort pflegt das CRM, den Namen kannst du dort ändern."
          : !hasDays
            ? "Sobald Produktionstage eingetragen sind und der Vorgang beauftragt ist, legt das CRM das Event an."
            : !confirmed
              ? "Wird mit der Beauftragung angelegt. Bis dahin steht der Termin als „unbestätigt“ im Kalender."
              : candidates.length
                ? "Wartet auf deine Antwort."
                : "Wird beim nächsten Abgleich angelegt."}
      </p>

      {candidates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          <p>Auf der Website gibt es im selben Zeitraum schon ein Event. Ist das dieses?</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button key={c.id} type="button" disabled={pending} onClick={() => startTransition(() => linkWebsiteEventAction(dealId, c.id))} className={btnQuiet}>
                Ja: {c.name} <span className="font-normal text-muted">({when(c)})</span>
              </button>
            ))}
            <button type="button" disabled={pending} onClick={() => startTransition(() => ownWebsiteEventAction(dealId))} className={btnQuiet}>
              Nein, eigenes Event
            </button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={props.isPublic}
          disabled={pending}
          onChange={(e) => {
            const value = e.target.checked;
            startTransition(() => setWebsitePublicAction(dealId, value));
          }}
          className="h-5 w-5 accent-ink"
        />
        Öffentlich ankündigen <span className="text-xs text-muted">auf /treffen und /business-events</span>
      </label>

      {props.notice && <p className="text-sm text-danger-ink">{props.notice}</p>}
      {props.error && <FormError message={`Die Website konnte nicht aktualisiert werden: ${props.error} Die App versucht es automatisch erneut.`} />}
    </section>
  );
}
