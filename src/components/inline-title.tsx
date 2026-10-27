"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Check, Pencil, X } from "lucide-react";
import { FormError } from "./ui";

// Überschrift mit Stift zum direkten Bearbeiten: Enter speichert, Esc bricht ab
export function InlineTitle({
  value,
  label,
  onSave,
  extra,
}: {
  value: string;
  label: string;
  onSave: (value: string) => Promise<{ error?: string } | void>;
  // weitere Knöpfe hinter dem Stift, z. B. Foto fürs Website-Event
  extra?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const cancel = () => {
    setDraft(value);
    setError(undefined);
    setEditing(false);
  };
  const save = () => {
    const next = draft.trim();
    if (!next) return setError("Der Name darf nicht leer sein.");
    if (next === value) return cancel();
    startTransition(async () => {
      const result = await onSave(next);
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <h1 className="text-[28px] font-bold tracking-tight">{value}</h1>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
            setTimeout(() => input.current?.select(), 0);
          }}
          aria-label={`${label} bearbeiten`}
          title={`${label} bearbeiten`}
          className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
        {extra}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{label}</span>
          <input
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
            disabled={pending}
            maxLength={255}
            className="w-full rounded-xl border border-ink bg-surface px-3 py-1 text-[26px] font-bold tracking-tight outline-none"
          />
        </label>
        <button type="button" onClick={save} disabled={pending} aria-label="Speichern" className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-surface">
          <Check size={18} aria-hidden="true" />
        </button>
        <button type="button" onClick={cancel} disabled={pending} aria-label="Abbrechen" className="flex h-10 w-10 items-center justify-center rounded-full bg-bg text-muted hover:text-ink">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <FormError message={error} />
    </div>
  );
}
