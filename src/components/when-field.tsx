"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

// Zeitpunkt in Ortszeit für <input type="datetime-local">
function localValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// „Wann“ für Notizen und Anrufe, vorbelegt mit jetzt bzw. dem bisherigen Zeitpunkt. Geschickt wird „at“
// (ISO, im Browser aus der Ortszeit umgerechnet) nur, wenn du den Wert geändert hast; sonst gilt beim Anlegen
// der Moment des Speicherns und beim Bearbeiten der bisherige Zeitpunkt.
// compact: zuerst nur ein kleiner Knopf „jetzt“, der das Feld aufklappt (Notizfeld über der Zeitleiste)
export function WhenField({ initial, compact = false }: { initial?: Date; compact?: boolean }) {
  // erst im Browser füllen (Ortszeit des Geräts), nie beim Rendern auf dem Server
  const [value, setValue] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(!compact);
  const shown = value ?? localValue(initial ? new Date(initial) : new Date());
  const iso = dirty && !Number.isNaN(new Date(shown).getTime()) ? new Date(shown).toISOString() : "";
  const hidden = <input type="hidden" name="at" value={iso} />;
  const change = (v: string) => {
    setValue(v);
    setDirty(true);
  };

  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-muted hover:text-ink"
          aria-label="Zeitpunkt ändern, bisher jetzt"
        >
          <Clock size={13} aria-hidden="true" /> jetzt
        </button>
        {hidden}
      </>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={compact ? "text-xs text-muted" : "text-sm font-semibold"}>Wann</span>
      <input
        type="datetime-local"
        value={shown}
        max={localValue(new Date())}
        onChange={(e) => change(e.target.value)}
        aria-label="Wann"
        className="min-h-9 rounded-full border border-line bg-surface px-3 text-[13px]"
      />
      {(dirty || initial) && (
        <button
          type="button"
          onClick={() => {
            if (initial) return change(localValue(new Date()));
            setValue(null);
            setDirty(false);
            if (compact) setOpen(false);
          }}
          className="text-[12px] text-muted hover:text-ink"
        >
          jetzt
        </button>
      )}
      {hidden}
    </span>
  );
}
