"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { CalendarClock } from "lucide-react";
import { moveTaskAction, toggleTaskAction } from "@/app/(app)/actions";
import { addDaysIso, dateDe, dueLabel, nextMondayIso } from "@/lib/format";
import type { TaskRow } from "@/lib/queries";
import { Empty } from "./ui";

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

export function TaskList({ tasks, today, empty }: { tasks: TaskRow[]; today: string; empty: string }) {
  const [, startTransition] = useTransition();
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
        const context = [task.companyName, task.dealTitle].filter(Boolean).join(" · ");
        return (
          <li key={task.id} className="flex items-center gap-3.5 border-t border-line-soft px-5 py-3">
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
              <p className={`text-sm font-medium ${done ? "text-muted line-through" : ""}`}>{task.title}</p>
              {context && (
                <p className="truncate text-xs text-muted">
                  {task.dealId ? <Link href={`/vorgaenge/${task.dealId}`} className="inline-block py-1 hover:text-ink hover:underline">{context}</Link> : context}
                </p>
              )}
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
