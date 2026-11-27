"use client";

import { useState, useTransition } from "react";
import { confirmDealAction, unconfirmDealAction } from "@/app/(app)/actions";

// Schalter „Reserviert/Bestätigt“ für Produktionstermine auf der Startseite.
// Einschalten setzt den Vorgang auf „Beauftragt“ (Kalender fest, Event auf die Website);
// danach bleibt „Rückgängig“ stehen, bis die Seite neu geladen wird.
export function ConfirmDealToggle({ dealId, reserved, label }: { dealId: number; reserved: boolean; label: string }) {
  const [undoTo, setUndoTo] = useState<"anfrage" | "angebot" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  // Schon beauftragt und nicht gerade hier umgeschaltet: kein Schalter
  if (!reserved && !undoTo) return null;
  const on = !reserved;

  const toggle = () =>
    startTransition(async () => {
      setError(undefined);
      if (!on) {
        const r = await confirmDealAction(dealId);
        if (r.error) setError(r.error);
        else if (r.from) setUndoTo(r.from);
      } else if (undoTo) {
        const r = await unconfirmDealAction(dealId, undoTo);
        if (r.error) setError(r.error);
        else setUndoTo(null);
      }
    });

  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${on ? "bestätigt, zum Rückgängigmachen klicken" : "reserviert, als beauftragt bestätigen"}`}
        title={on ? "Rückgängig: wieder nur reserviert" : "Auftrag bestätigt: auf „Beauftragt“ setzen"}
        onClick={toggle}
        disabled={pending}
        className="pointer-coarse:min-h-11 flex items-center gap-2 rounded-full px-2 py-1 text-[12px] font-semibold text-muted hover:bg-bg hover:text-ink disabled:opacity-60"
      >
        <span className={on ? "text-accent-ink" : ""}>{pending ? "…" : on ? "Bestätigt" : "Reserviert"}</span>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`} aria-hidden="true">
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      {error && <span className="text-[11px] text-danger-ink">{error}</span>}
    </div>
  );
}
