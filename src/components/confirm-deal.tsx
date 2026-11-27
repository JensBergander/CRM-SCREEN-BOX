"use client";

import { useEffect, useState, useTransition } from "react";
import { confirmDealAction } from "@/app/(app)/actions";

// Schalter „Reserviert/Bestätigt“ für Produktionstage auf der Startseite.
// Einschalten setzt den Vorgang auf „Beauftragt“ (Kalender fest, Event auf die Website);
// danach steht kurz „Bestätigt“ da und der Schalter verschwindet. Zurück geht es nur im Vorgang.
export function ConfirmDealToggle({ dealId, reserved, label }: { dealId: number; reserved: boolean; label: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!confirmed) return;
    const timer = setTimeout(() => setGone(true), 1500);
    return () => clearTimeout(timer);
  }, [confirmed]);

  if (gone || (!reserved && !confirmed)) return null;

  const confirm = () =>
    startTransition(async () => {
      setError(undefined);
      const r = await confirmDealAction(dealId);
      if (r.error) setError(r.error);
      else setConfirmed(true);
    });

  return (
    <div className={`flex shrink-0 flex-col items-end gap-0.5 transition-opacity duration-500 ${confirmed ? "opacity-0 delay-1000" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={confirmed}
        aria-label={`${label}: ${confirmed ? "bestätigt" : "reserviert, als beauftragt bestätigen"}`}
        title={confirmed ? "Bestätigt" : "Auftrag bestätigt: auf „Beauftragt“ setzen"}
        onClick={confirm}
        disabled={pending || confirmed}
        className="pointer-coarse:min-h-11 flex items-center gap-2 rounded-full px-2 py-1 text-[12px] font-semibold text-muted hover:bg-bg hover:text-ink disabled:hover:bg-transparent"
      >
        <span className={confirmed ? "text-ok-ink" : ""}>{pending ? "…" : confirmed ? "Bestätigt" : "Reserviert"}</span>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${confirmed || pending ? "bg-ok" : "bg-line"}`} aria-hidden="true">
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow transition-all ${confirmed || pending ? "left-[18px]" : "left-0.5"}`} />
        </span>
      </button>
      {error && <span className="text-[11px] text-danger-ink">{error}</span>}
    </div>
  );
}
