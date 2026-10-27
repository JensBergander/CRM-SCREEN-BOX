"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { toggleTaskAction } from "@/app/(app)/actions";
import { dueLabel } from "@/lib/format";
import type { TaskRow } from "@/lib/queries";
import { Empty } from "./ui";

export function TaskList({ tasks, today, empty }: { tasks: TaskRow[]; today: string; empty: string }) {
  const [, startTransition] = useTransition();
  const [optimistic, setDone] = useOptimistic(
    tasks,
    (state, { id, done }: { id: number; done: boolean }) =>
      state.map((t) => (t.id === id ? { ...t, doneAt: done ? new Date() : null } : t)),
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
                  setDone({ id: task.id, done: value });
                  await toggleTaskAction(task.id, value);
                });
              }}
              className="h-5 w-5 shrink-0 accent-ink"
            />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${done ? "text-muted line-through" : ""}`}>{task.title}</p>
              {context && (
                <p className="truncate text-xs text-muted">
                  {task.dealId ? <Link href={`/vorgaenge/${task.dealId}`}>{context}</Link> : context}
                </p>
              )}
            </div>
            {!done && (
              <span className={`whitespace-nowrap text-xs font-semibold ${due.overdue ? "text-danger-ink" : "text-ink"}`}>
                {due.text}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
