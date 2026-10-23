import "server-only";
import { and, asc, eq, gte, inArray, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, deals, productionDays } from "@/db/schema";

export type ScheduleRow = {
  dealId: number;
  title: string;
  company: string;
  stage: string;
  location: string | null;
  hasMap: boolean;
  days: { day: string; startTime: string; endTime: string }[];
  postStart: string | null;
  postEnd: string | null;
};

// Projekte mit Produktion oder Postproduktion im Zeitraum (ohne verlorene)
export async function scheduleBetween(from: string, to: string): Promise<ScheduleRow[]> {
  const dayRows = await db
    .select({ dealId: productionDays.dealId })
    .from(productionDays)
    .where(and(gte(productionDays.day, from), lte(productionDays.day, to)));
  const postRows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(lte(deals.postStart, to), gte(deals.postEnd, from)));
  const ids = [...new Set([...dayRows.map((r) => r.dealId), ...postRows.map((r) => r.id)])];
  if (!ids.length) return [];

  const [rows, days] = await Promise.all([
    db
      .select({ id: deals.id, title: deals.title, stage: deals.stage, location: deals.location, lat: deals.locationLat, postStart: deals.postStart, postEnd: deals.postEnd, company: companies.name })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(and(inArray(deals.id, ids), ne(deals.stage, "verloren"))),
    db.select().from(productionDays).where(inArray(productionDays.dealId, ids)).orderBy(asc(productionDays.day), asc(productionDays.startTime)),
  ]);
  return rows
    .map((r) => ({
      dealId: r.id,
      title: r.title,
      company: r.company,
      stage: r.stage,
      location: r.location,
      hasMap: r.lat !== null,
      days: days.filter((d) => d.dealId === r.id).map((d) => ({ day: d.day, startTime: d.startTime, endTime: d.endTime })),
      postStart: r.postStart,
      postEnd: r.postEnd,
    }))
    .sort((a, b) => (a.days[0]?.day ?? a.postStart ?? "").localeCompare(b.days[0]?.day ?? b.postStart ?? ""));
}

// Nächste Produktionstage für die Startseite
export async function upcomingProductionDays(from: string, to: string) {
  return db
    .select({
      day: productionDays.day,
      startTime: productionDays.startTime,
      endTime: productionDays.endTime,
      dealId: deals.id,
      title: deals.title,
      location: deals.location,
      hasMap: sql<number>`${deals.locationLat} IS NOT NULL`,
      company: companies.name,
    })
    .from(productionDays)
    .innerJoin(deals, eq(deals.id, productionDays.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(and(gte(productionDays.day, from), lte(productionDays.day, to), or(ne(deals.stage, "verloren"))))
    .orderBy(asc(productionDays.day), asc(productionDays.startTime));
}
