import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { appState, deals, productionDays, type Stage } from "@/db/schema";
import { todayIso } from "./format";

// Beauftragte Produktionen als Event auf screen-box.de/admin/events (Treffpunkt /treffen).
// Zeitraum und Ort führt das CRM; Name und „öffentlich“ nur, solange sie auf der Website niemand geändert hat.
export const CONFIRMED: Stage[] = ["beauftragt", "erledigt", "rechnung", "bezahlt"];

const BASE = (process.env.WEBSITE_URL ?? "https://screen-box.de").replace(/\/$/, "");
export const WEBSITE_EVENTS_URL = `${BASE}/admin/events`;

export type WebsiteEvent = { id: number; name: string; ort: string | null; startAt: string; endAt: string; oeffentlich: boolean; anmeldungen: number };

export function websiteConfigured() {
  return !!process.env.WEBSITE_ADMIN_SECRET;
}

async function api<T>(method: string, query = "", body?: object): Promise<T> {
  const res = await fetch(`${BASE}/api/admin/treff-events${query}`, {
    method,
    headers: { "x-admin-secret": process.env.WEBSITE_ADMIN_SECRET ?? "", ...(body && { "content-type": "application/json" }) },
    body: body && JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`Website antwortet ${res.status}${data.error ? `: ${data.error}` : ""}`);
  return data;
}

async function eventById(id: number): Promise<WebsiteEvent | null> {
  const { events } = await api<{ events: WebsiteEvent[] }>("GET", `?ids=${id}`);
  return events[0] ?? null;
}

// Berliner Ortszeit im Format der Website (YYYY-MM-DDTHH:MM)
function nowBerlin() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(new Date()).replace(" ", "T");
}

export function parseCandidates(value: string | null): WebsiteEvent[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as WebsiteEvent[];
  } catch {
    return [];
  }
}

// Event eines Vorgangs auf den Stand im CRM bringen; Fehler werden am Vorgang vermerkt und später erneut versucht
export async function syncDealWebsite(dealId: number): Promise<void> {
  if (!websiteConfigured()) return;
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return;
  const days = await db.select().from(productionDays).where(eq(productionDays.dealId, dealId)).orderBy(asc(productionDays.day), asc(productionDays.startTime));

  try {
    if (!CONFIRMED.includes(deal.stage) || !days.length) {
      await removeEvent(deal);
      return;
    }
    const first = days[0];
    const last = days[days.length - 1];
    const startAt = `${first.day}T${first.startTime}`;
    const endAt = `${last.day}T${last.endTime}`;
    const ort = deal.location?.slice(0, 255) ?? null;

    const current = deal.websiteEventId ? await eventById(deal.websiteEventId) : null;
    if (current) {
      const name = current.name === deal.websiteName ? deal.title : undefined;
      const oeffentlich = deal.websitePublic !== deal.websitePublicSent ? deal.websitePublic : undefined;
      await api("PATCH", "", { id: current.id, startAt, endAt, ort, ...(name && { name }), ...(oeffentlich !== undefined && { oeffentlich }) });
      await db
        .update(deals)
        .set({
          ...(name && { websiteName: name }),
          ...(oeffentlich !== undefined && { websitePublicSent: oeffentlich }),
          websiteCandidates: null,
          websiteNotice: null,
          websiteError: null,
        })
        .where(eq(deals.id, dealId));
      return;
    }

    // Noch kein Event (oder auf der Website gelöscht): erst nach einem zeitgleichen, von Hand angelegten fragen
    if (!deal.websiteOwn) {
      const { events } = await api<{ events: WebsiteEvent[] }>("GET", `?von=${encodeURIComponent(startAt)}&bis=${encodeURIComponent(endAt)}`);
      const linked = events.length
        ? await db.select({ id: deals.websiteEventId }).from(deals).where(inArray(deals.websiteEventId, events.map((e) => e.id)))
        : [];
      const foreign = events.filter((e) => !linked.some((l) => l.id === e.id));
      if (foreign.length) {
        await db
          .update(deals)
          .set({ websiteEventId: null, websiteCandidates: JSON.stringify(foreign), websiteNotice: null, websiteError: null })
          .where(eq(deals.id, dealId));
        return;
      }
    }
    const { id } = await api<{ id: number }>("POST", "", { name: deal.title.slice(0, 255), ort: ort ?? undefined, startAt, endAt, oeffentlich: deal.websitePublic });
    await db
      .update(deals)
      .set({ websiteEventId: id, websiteName: deal.title.slice(0, 255), websitePublicSent: deal.websitePublic, websiteCandidates: null, websiteNotice: null, websiteError: null })
      .where(eq(deals.id, dealId));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(deals).set({ websiteError: message.slice(0, 1000) }).where(eq(deals.id, dealId));
  }
}

// Löschen nur, solange das Event nicht begonnen hat und niemand angemeldet ist; sonst ein Hinweis am Vorgang
async function removeEvent(deal: typeof deals.$inferSelect) {
  const clear = { websiteEventId: null, websiteName: null, websitePublicSent: null, websiteCandidates: null, websiteNotice: null, websiteError: null };
  if (!deal.websiteEventId) {
    if (deal.websiteCandidates || deal.websiteError) await db.update(deals).set(clear).where(eq(deals.id, deal.id));
    return;
  }
  const current = await eventById(deal.websiteEventId);
  if (current && (current.startAt <= nowBerlin() || current.anmeldungen > 0)) {
    const why = current.anmeldungen > 0 ? `${current.anmeldungen} Anmeldung${current.anmeldungen === 1 ? "" : "en"}` : "es hat schon begonnen";
    await db
      .update(deals)
      .set({ websiteCandidates: null, websiteError: null, websiteNotice: `Das Event „${current.name}“ steht noch auf der Website (${why}). Bitte dort selbst löschen.` })
      .where(eq(deals.id, deal.id));
    return;
  }
  if (current) await api("DELETE", `?id=${current.id}`);
  await db.update(deals).set(clear).where(eq(deals.id, deal.id));
}

// Bevor ein Vorgang gelöscht wird; nach denselben Regeln wie bei „Verloren“
export async function deleteDealWebsite(dealId: number) {
  if (!websiteConfigured()) return;
  const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) return;
  try {
    await removeEvent(deal);
  } catch (e) {
    console.error("Website-Event konnte nicht gelöscht werden:", e);
  }
}

// Antwort auf die Rückfrage: dieses Event gehört zum Vorgang. Name und „öffentlich“ bleiben, wie sie auf der Website stehen.
export async function linkWebsiteEvent(dealId: number, eventId: number) {
  const [deal] = await db.select({ websitePublic: deals.websitePublic }).from(deals).where(eq(deals.id, dealId));
  if (!deal) return;
  await db
    .update(deals)
    .set({ websiteEventId: eventId, websiteName: null, websitePublicSent: deal.websitePublic, websiteOwn: false, websiteCandidates: null })
    .where(eq(deals.id, dealId));
  await syncDealWebsite(dealId);
}

export async function ownWebsiteEvent(dealId: number) {
  await db.update(deals).set({ websiteOwn: true, websiteCandidates: null }).where(eq(deals.id, dealId));
  await syncDealWebsite(dealId);
}

export async function setWebsitePublic(dealId: number, value: boolean) {
  await db.update(deals).set({ websitePublic: value }).where(eq(deals.id, dealId));
  await syncDealWebsite(dealId);
}

// Für den Cronjob: einmalig laufende und kommende Produktionen nachtragen, danach Fehlschläge erneut versuchen
export async function retryWebsiteSync(): Promise<number> {
  if (!websiteConfigured()) return 0;
  const [done] = await db.select().from(appState).where(eq(appState.key, "website_backfill"));
  let ids: number[];
  if (!done) {
    const rows = await db
      .select({ id: deals.id })
      .from(deals)
      .innerJoin(productionDays, eq(productionDays.dealId, deals.id))
      .where(and(inArray(deals.stage, CONFIRMED), isNull(deals.websiteEventId)))
      .groupBy(deals.id)
      .having(sql`max(${productionDays.day}) >= ${todayIso()}`);
    ids = rows.map((r) => r.id);
    await db.insert(appState).values({ key: "website_backfill", value: todayIso() }).onDuplicateKeyUpdate({ set: { value: todayIso() } });
  } else {
    ids = (await db.select({ id: deals.id }).from(deals).where(isNotNull(deals.websiteError)).limit(10)).map((r) => r.id);
  }
  for (const id of ids) await syncDealWebsite(id);
  return ids.length;
}
