import { addDaysIso, todayIso } from "@/lib/format";
import { listTasks } from "@/lib/queries";
import { TaskForm } from "@/components/forms";
import { TaskList } from "@/components/task-list";
import { Card, PageHeader } from "@/components/ui";

export default async function TasksPage() {
  const today = todayIso();
  const weekEnd = addDaysIso(today, 7);
  const [open, done] = await Promise.all([listTasks({ open: true }), listTasks({ open: false })]);

  const groups = [
    { title: "Überfällig", items: open.filter((t) => t.dueDate && t.dueDate < today) },
    { title: "Heute", items: open.filter((t) => t.dueDate === today) },
    { title: "Nächste 7 Tage", items: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekEnd) },
    { title: "Später oder ohne Termin", items: open.filter((t) => !t.dueDate || t.dueDate > weekEnd) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Aufgaben" sub={`${open.length} offen`} />
      <Card title="Neue Aufgabe">
        <TaskForm />
      </Card>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-5">
        {groups.map((g) => (
          <Card key={g.title} title={g.title} aside={<span className="text-xs text-muted">{g.items.length}</span>}>
            <TaskList tasks={g.items} today={today} empty="Nichts." />
          </Card>
        ))}
      </div>
      <Card title="Zuletzt erledigt">
        <TaskList tasks={done} today={today} empty="Noch nichts erledigt." />
      </Card>
    </div>
  );
}
