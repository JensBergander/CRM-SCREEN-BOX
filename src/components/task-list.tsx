"use client";

import Link from "next/link";
import { Fragment, useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { CalendarClock, ChevronDown, FileText } from "lucide-react";
import { moveTaskAction, toggleTaskAction, updateTaskAction } from "@/app/(app)/actions";
import { addDaysIso, dateDe, dueLabel, nextMondayIso } from "@/lib/format";
import type { TaskRow } from "@/lib/queries";
import { btnPrimary, btnQuiet, Empty, FormError, Input, Textarea } from "./ui";

type Change = { id: number; done?: boolean; dueDate?: string };

// „Verschieben“: Morgen, Nächste Woche (Montag) oder ein Datum
function MoveMenu({ title, today, onMove }: { title: string; today: string; onMove: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const pick = (date: string) => {
    setOpen(false);
    onMove(date);
  };
  const tomorrow = addDaysIso(today, 1);
  const monday = nextMondayIso(today);
  const item = "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg";
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${title} verschieben`}
        title="Verschieben"
        className="pointer-coarse:h-11 pointer-coarse:w-11 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-bg hover:text-ink"
      >
        <CalendarClock size={16} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-muted">Verschieben auf</p>
          <button type="button" role="menuitem" className={item} onClick={() => pick(tomorrow)}>
            Morgen <span className="text-xs text-muted">{dateDe(tomorrow).slice(0, 6)}</span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => pick(monday)}>
            Nächste Woche <span className="text-xs text-muted">Mo {dateDe(monday).slice(0, 6)}</span>
          </button>
          <label className="flex flex-col gap-1 px-3 py-2 text-sm">
            Datum
            <input
              type="date"
              min={today}
              // beim Tippen entstehen Zwischenstände wie 0202-…; erst ein Datum ab heute zählt
              onChange={(e) => e.target.value >= today && pick(e.target.value)}
              className="min-h-9 rounded-lg border border-line bg-surface px-2 text-sm"
            />
          </label>
        </div>
      )}
    </div>
  );
}

// Links in den Infos anklickbar machen
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all font-semibold underline underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// Geöffnete Aufgabe: weitere Infos lesen und Überschrift oder Infos ändern
function TaskDetails({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const [editing, setEditing] = useState(!task.details);
  const [state, action, pending] = useActionState(updateTaskAction.bind(null, task.id), undefined);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) setEditing(false);
    wasPending.current = pending;
  }, [pending, state]);
  if (!editing) {
    return (
      <div className="mt-2 flex flex-col gap-2 rounded-xl bg-bg p-3">
        <p className="whitespace-pre-line text-sm leading-relaxed">
          <Linked text={task.details ?? ""} />
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className={btnQuiet}>Bearbeiten</button>
          <button type="button" onClick={onClose} className={btnQuiet}>Schließen</button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="mt-2 flex flex-col gap-2.5 rounded-xl bg-bg p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Überschrift
        <Input name="title" defaultValue={task.title} required className="bg-surface" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Weitere Infos
        <Textarea
          name="details"
          defaultValue={task.details ?? ""}
          rows={Math.min(16, Math.max(4, (task.details ?? "").split("\n").length + 2))}
          autoFocus
          placeholder="Notizen, Text, Links … (nur hier in der geöffneten Aufgabe sichtbar)"
          className="resize-y bg-surface"
        />
      </label>
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={btnPrimary}>{pending ? "Speichert …" : "Speichern"}</button>
        <button type="button" disabled={pending} onClick={task.details ? () => setEditing(false) : onClose} className={btnQuiet}>Abbrechen</button>
      </div>
    </form>
  );
}

export function TaskList({ tasks, today, empty }: { tasks: TaskRow[]; today: string; empty: string }) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState<number | null>(null);
  const [optimistic, change] = useOptimistic(tasks, (state, c: Change) =>
    state.map((t) =>
      t.id === c.id
        ? { ...t, ...(c.done !== undefined && { doneAt: c.done ? new Date() : null }), ...(c.dueDate && { dueDate: c.dueDate }) }
        : t,
    ),
  );

  if (!optimistic.length) return <Empty>{empty}</Empty>;

  return (
    <ul>
      {optimistic.map((task) => {
        const due = dueLabel(task.dueDate, today);
        const done = !!task.doneAt;
        return (
          <li key={task.id} className={`flex gap-3.5 border-t border-line-soft px-5 py-3 ${open === task.id ? "items-start" : "items-center"}`}>
            <input
              type="checkbox"
              aria-label={`${task.title} erledigt`}
              checked={done}
              onChange={(e) => {
                const value = e.target.checked;
                startTransition(async () => {
                  change({ id: task.id, done: value });
                  await toggleTaskAction(task.id, value);
                });
              }}
              className="h-5 w-5 shrink-0 accent-ink"
            />
            <div className="min-w-0 flex-1">
              {/* Klick auf die Überschrift öffnet die Aufgabe mit den weiteren Infos */}
              <button
                type="button"
                onClick={() => setOpen(open === task.id ? null : task.id)}
                aria-expanded={open === task.id}
                className={`group flex max-w-full items-center gap-1.5 text-left text-sm font-medium hover:underline ${done ? "text-muted line-through" : ""}`}
              >
                <span className="min-w-0">{task.title}</span>
                {task.details && <FileText size={13} className="shrink-0 text-muted" aria-label="mit weiteren Infos" />}
                <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-muted opacity-0 transition-transform group-hover:opacity-100 group-focus-visible:opacity-100 ${open === task.id ? "rotate-180 opacity-100" : ""}`} />
              </button>
              {(task.companyName || task.dealTitle) && (
                <p className="truncate text-xs text-muted">
                  {task.companyId && task.companyName && (
                    <Link href={`/firmen/${task.companyId}`} className="inline-block py-1 hover:text-ink hover:underline">{task.companyName.trim()}</Link>
                  )}
                  {task.companyName && task.dealTitle && " · "}
                  {task.dealId && task.dealTitle && (
                    <Link href={`/vorgaenge/${task.dealId}`} className="inline-block py-1 hover:text-ink hover:underline">{task.dealTitle}</Link>
                  )}
                </p>
              )}
              {open === task.id && <TaskDetails task={task} onClose={() => setOpen(null)} />}
            </div>
            {!done && (
              <>
                <span className={`whitespace-nowrap text-xs font-semibold ${due.overdue ? "text-danger-ink" : "text-ink"}`}>
                  {due.text}
                </span>
                <MoveMenu
                  title={task.title}
                  today={today}
                  onMove={(dueDate) =>
                    startTransition(async () => {
                      change({ id: task.id, dueDate });
                      await moveTaskAction(task.id, dueDate);
                    })
                  }
                />
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
