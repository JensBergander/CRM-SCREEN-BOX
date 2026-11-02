"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { addActivityAction } from "@/app/(app)/actions";
import { RunningDot } from "./timeline";
import { btnPrimary, FormError, Textarea } from "./ui";

export type ActivityKind = "notiz" | "anruf";

// Datum in Ortszeit, für die Schnellknöpfe der Wiedervorlage
function inDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("sv-SE");
}
function nextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toLocaleDateString("sv-SE");
}

const pill = (on: boolean) =>
  `inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink ${
    on ? "border-ink bg-ink text-surface" : "border-line bg-surface text-muted"
  }`;

// Großes Fenster für Notiz oder Anruf, mit Zuordnung zum Vorgang und optionaler Wiedervorlage
export function ActivityDialog({
  companyId,
  dealId,
  projects = [],
  title,
  initialKind,
  initialBody = "",
  onClose,
}: {
  companyId: number | null;
  dealId: number | null;
  // laufende Vorgänge der Firma; nur ohne festen Vorgang
  projects?: { id: number; title: string }[];
  title?: string;
  initialKind: ActivityKind;
  initialBody?: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(addActivityAction.bind(null, { companyId, dealId }), undefined);
  const [kind, setKind] = useState<ActivityKind>(initialKind);
  const [target, setTarget] = useState(projects[0] ? String(projects[0].id) : "");
  const [followUp, setFollowUp] = useState("");
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !pending && state && !state.error) onClose();
  }, [pending, state, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const quick = [
    { label: "morgen", value: inDays(1) },
    { label: "in 3 Tagen", value: inDays(3) },
    { label: "nächste Woche", value: nextMonday() },
  ];

  // Portal: das Fenster kann aus einem anderen Formular heraus geöffnet werden (Zeitleiste)
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={kind === "anruf" ? "Anruf festhalten" : "Notiz festhalten"}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        action={action}
        onSubmit={() => (submitted.current = true)}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-4 overflow-auto rounded-3xl bg-surface p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{kind === "anruf" ? "Anruf festhalten" : "Notiz festhalten"}</h2>
            {title && <p className="text-sm text-muted">{title}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Schließen" className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div role="radiogroup" aria-label="Art" className="flex gap-1.5">
          {(["notiz", "anruf"] as const).map((k) => (
            <label key={k} className={pill(kind === k)}>
              <input type="radio" name="type" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "anruf" ? "Anruf" : "Notiz"}
            </label>
          ))}
        </div>

        <label>
          <span className="sr-only">Text</span>
          <Textarea name="body" rows={10} defaultValue={initialBody} required autoFocus placeholder={kind === "anruf" ? "Worum ging es im Gespräch?" : "Notiz …"} className="resize-y" />
        </label>

        {!dealId && projects.length > 0 && (
          <div role="radiogroup" aria-label="Zuordnen zu" className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted">Zu:</span>
            {[...projects.map((p) => ({ value: String(p.id), label: p.title })), { value: "", label: "Nur Firma" }].map((o) => (
              <label key={o.value || "firma"} className={pill(target === o.value)}>
                <input type="radio" name="dealId" value={o.value} checked={target === o.value} onChange={() => setTarget(o.value)} className="sr-only" />
                {o.value && <RunningDot />}
                {o.label}
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">
            Wiedervorlage <span className="font-normal text-muted">optional, legt eine Aufgabe an</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {quick.map((q) => (
              <button key={q.label} type="button" onClick={() => setFollowUp(followUp === q.value ? "" : q.value)} className={pill(followUp === q.value)}>
                {q.label}
              </button>
            ))}
            <input
              type="date"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              aria-label="Wiedervorlage am"
              className="min-h-9 rounded-full border border-line bg-surface px-3 text-[13px]"
            />
            {followUp && (
              <button type="button" onClick={() => setFollowUp("")} className="text-[13px] text-muted hover:text-ink">
                keine
              </button>
            )}
          </div>
          <input type="hidden" name="followUp" value={followUp} />
        </div>

        <FormError message={state?.error} />
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className={btnPrimary}>
            {pending ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
