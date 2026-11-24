import "server-only";
import { and, asc, eq, isNotNull, max, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, deals, productionDays } from "@/db/schema";
import { addDaysIso, dateDe, todayIso } from "./format";

// Projekte in Bearbeitung, deren geplantes Ende vorbei ist oder nie eingetragen wurde: „Wie lange brauchst du noch?“
export type PostQuestion = { dealId: number; title: string; company: string; postEnd: string | null };

export async function postQuestions(dealId?: number): Promise<PostQuestion[]> {
  const rows = await db
    .select({ dealId: deals.id, title: deals.title, company: companies.name, postEnd: deals.postEnd })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(
      and(
        eq(deals.stage, "bearbeitung"),
        sql`(${deals.postEnd} is null or ${deals.postEnd} < ${todayIso()})`,
        dealId ? eq(deals.id, dealId) : undefined,
      ),
    )
    .orderBy(asc(deals.postEnd));
  return rows;
}

// Neues Ende der Postproduktion aus der Antwort; Verlängerung in der Zeitleiste
export async function extendPost(dealId: number, until: string) {
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return;
  const today = todayIso();
  const [last] = await db.select({ day: max(productionDays.day) }).from(productionDays).where(eq(productionDays.dealId, dealId));
  const shootEnd = last?.day ? String(last.day).slice(0, 10) : null;
  const postStart = deal.postStart ?? (shootEnd && shootEnd < today ? addDaysIso(shootEnd, 1) : today);
  await db
    .update(deals)
    .set({
      postEnd: until,
      postStart,
      // ohne früheren Plan gilt die erste Antwort als Plan
      postEndPlanned: deal.postEndPlanned ?? until,
    })
    .where(eq(deals.id, dealId));
  const days = deal.postEnd ? Math.round((Date.parse(until) - Date.parse(deal.postEnd)) / 86_400_000) : null;
  await db.insert(activities).values({
    companyId: deal.companyId,
    dealId,
    type: "phase",
    body: deal.postEnd
      ? `${deal.title}: Postproduktion verlängert bis ${dateDe(until)} (+${days} ${days === 1 ? "Tag" : "Tage"}, geplant war ${dateDe(deal.postEndPlanned ?? deal.postEnd)})`
      : `${deal.title}: Postproduktion fertig bis ${dateDe(until)}`,
  });
}

// Schätzgenauigkeit: wie viel länger (oder kürzer) die Postproduktion dauerte als zuerst geplant.
// Erst ab 3 abgeschlossenen Projekten mit Plan; Faktor 1,4 heißt 40 % länger.
const MIN_PROJECTS = 3;

export async function estimateAccuracy(): Promise<{ factor: number; count: number } | null> {
  const rows = await db
    .select({ start: deals.postStart, planned: deals.postEndPlanned, finished: deals.postFinished })
    .from(deals)
    .where(and(isNotNull(deals.postStart), isNotNull(deals.postEndPlanned), isNotNull(deals.postFinished)));
  const ratios = rows
    .map((r) => {
      const planned = (Date.parse(r.planned!) - Date.parse(r.start!)) / 86_400_000 + 1;
      const actual = (Date.parse(r.finished!) - Date.parse(r.start!)) / 86_400_000 + 1;
      return planned > 0 && actual > 0 ? actual / planned : null;
    })
    .filter((x): x is number => x !== null && x < 10);
  if (ratios.length < MIN_PROJECTS) return null;
  return { factor: Math.round((ratios.reduce((s, r) => s + r, 0) / ratios.length) * 100) / 100, count: ratios.length };
}
