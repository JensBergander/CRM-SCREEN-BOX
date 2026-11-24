import "server-only";
import { and, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { deals, tasks } from "@/db/schema";
import { todayIso } from "./format";

// So viele Monate vor dem Vorjahrestermin kommt „Nachfragen: Pferdeshow 2027?“
export const REMIND_MONTHS_BEFORE = 3;

function addMonthsIso(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // 31. eines Monats ohne 31. Tag: auf den letzten Tag kürzen
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

// „Pferdeshow 2026“ → „Pferdeshow 2027“, sonst Jahr anhängen
export function nextEditionTitle(title: string, year: number) {
  return /\b20\d\d\b/.test(title) ? title.replace(/\b20\d\d\b/, String(year)) : `${title} ${year}`;
}

// Erinnerungen an wiederkehrende Projekte: bezahlt, mit Drehtermin, nicht „einmalig“,
// und die Firma hat seit dem Projekt noch keinen neuen Vorgang angelegt. Je Projekt höchstens einmal.
export async function createAnniversaryTasks(): Promise<string[]> {
  const today = todayIso();
  const candidates = await db
    .select({ id: deals.id, companyId: deals.companyId, title: deals.title, projectDate: deals.projectDate })
    .from(deals)
    .where(and(eq(deals.stage, "bezahlt"), eq(deals.oneOff, false), isNotNull(deals.projectDate)));
  const due = candidates.filter((d) => {
    const next = addMonthsIso(d.projectDate!, 12);
    return addMonthsIso(next, -REMIND_MONTHS_BEFORE) <= today && today <= next;
  });
  if (!due.length) return [];

  const reminded = new Set(
    (await db.select({ dealId: tasks.dealId }).from(tasks).where(and(eq(tasks.kind, "jahrestermin"), inArray(tasks.dealId, due.map((d) => d.id)))))
      .map((t) => t.dealId),
  );
  const log: string[] = [];
  for (const d of due) {
    if (reminded.has(d.id)) continue;
    const [newer] = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.companyId, d.companyId), ne(deals.id, d.id), gt(deals.createdAt, new Date(`${d.projectDate}T00:00:00Z`))))
      .limit(1);
    if (newer) continue;
    const year = Number(d.projectDate!.slice(0, 4)) + 1;
    await db.insert(tasks).values({
      title: `Nachfragen: ${nextEditionTitle(d.title, year)}?`,
      dueDate: today,
      companyId: d.companyId,
      dealId: d.id,
      kind: "jahrestermin",
    });
    log.push(`${d.title}: Jahres-Erinnerung`);
  }
  return log;
}
