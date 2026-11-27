import "server-only";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, activityPeople, appState, calendarEvents, companies, contacts, deals, people, taskPeople, tasks } from "@/db/schema";
import type { Stage } from "@/db/schema";
import { addDaysIso, todayIso } from "./format";
import { changeStage } from "./pipeline";
import { graphGet, mailboxes } from "./graph";
import { isOwn, matchAddress } from "./mail";
import { fullName } from "./people";

// Termine aus dem Outlook-Kalender von office@. Outlook führt: das CRM liest nur, ordnet zu und
// hält vergangene Kundentermine in der Zeitleiste fest.

// So weit zurück (für „Wie war der Call?“) und voraus (Startseite: heute + 7 Tage) wird gelesen
const BACK_DAYS = 3;
const AHEAD_DAYS = 8;
// Beim Öffnen der Startseite neu lesen, wenn der letzte Abruf älter ist
const STALE_MS = 2 * 60_000;
// Unbeantwortete „Wie war der Call?“ verschwinden danach
const REVIEW_DAYS = 3;
// Nicht festgehaltene Termine werden danach aufgeräumt
const KEEP_DAYS = 30;
const STATE_KEY = "calendar_read_at";

// Outlook liefert Uhrzeiten in Berliner Ortszeit (siehe Prefer-Kopf); daraus den echten Zeitpunkt machen
const offsetFormat = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "shortOffset" });
function berlinOffsetHours(at: Date) {
  const name = offsetFormat.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  return Number(name.replace("GMT", "") || 0);
}
export function fromBerlin(wall: string): Date {
  const asUtc = new Date(`${wall.slice(0, 19)}Z`);
  return new Date(asUtc.getTime() - berlinOffsetHours(asUtc) * 3_600_000);
}
// Beginn eines Berliner Kalendertags
export const berlinDayStart = (iso: string) => fromBerlin(`${iso}T00:00:00`);

const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" });
export const berlinIso = (d: Date) => dayFormat.format(d);

type GraphAddress = { emailAddress?: { name?: string; address?: string } };
type GraphEvent = {
  id: string;
  subject?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  isAllDay?: boolean;
  isCancelled?: boolean;
  responseStatus?: { response?: string };
  location?: { displayName?: string };
  attendees?: (GraphAddress & { status?: { response?: string } })[];
  organizer?: GraphAddress;
  webLink?: string;
  onlineMeeting?: { joinUrl?: string } | null;
  bodyPreview?: string;
  showAs?: string;
};

type Attendee = { email: string; name: string | null };

const MEETING = /https:\/\/(?:teams\.microsoft\.com|teams\.live\.com|[\w.-]*zoom\.us|meet\.google\.com|[\w.-]*webex\.com|[\w.-]*gotomeeting\.com|whereby\.com)\/[^\s<>"')\]]+/i;

// Link zum Beitreten: Teams-Besprechung, sonst ein Meeting-Link in Ort oder Text, sonst ein Ort, der eine Adresse ist
function joinUrlOf(e: GraphEvent): string | null {
  if (e.onlineMeeting?.joinUrl) return e.onlineMeeting.joinUrl;
  const location = e.location?.displayName?.trim() ?? "";
  const found = `${location}\n${e.bodyPreview ?? ""}`.match(MEETING);
  if (found) return found[0];
  return /^https?:\/\/\S+$/.test(location) ? location : null;
}

// Externe Teilnehmer (ohne eigene Adressen), Organisator eingeschlossen
function externalAttendees(e: GraphEvent): Attendee[] {
  const all = [e.organizer, ...(e.attendees ?? [])]
    .map((a) => ({ email: a?.emailAddress?.address?.trim().toLowerCase() ?? "", name: a?.emailAddress?.name?.trim() || null }))
    .filter((a) => a.email.includes("@") && !isOwn(a.email));
  return [...new Map(all.map((a) => [a.email, a])).values()];
}

// Vom CRM eingetragene Produktionstermine erkennen: Betreff „Produktion: …“ und Link auf den Vorgang im Text
function productionDealId(e: GraphEvent): number | null {
  if (!e.subject?.startsWith("Produktion:")) return null;
  const m = e.bodyPreview?.match(/\/vorgaenge\/(\d+)/);
  return m ? Number(m[1]) : null;
}

// Firma und Person aus den Teilnehmern: zuerst ein bekannter Kontakt, sonst Firmen-Mail oder Domain (ohne Freemailer)
async function matchAttendees(attendees: Attendee[], onlyCompany?: number): Promise<{ companyId: number | null; personId: number | null }> {
  let fallback: number | null = null;
  for (const a of attendees) {
    const hit = await matchAddress(a.email);
    if (!hit || (onlyCompany && hit.companyId !== onlyCompany)) continue;
    if (hit.contactId) {
      const [c] = await db.select({ personId: contacts.personId }).from(contacts).where(eq(contacts.id, hit.contactId));
      if (c) return { companyId: hit.companyId, personId: c.personId };
    }
    fallback ??= hit.companyId;
  }
  return { companyId: onlyCompany ?? fallback, personId: null };
}

export type SyncAppointmentsResult = { read: number; changed: boolean; logged: number };

// Kalender lesen und speichern; danach vergangene Kundentermine in der Zeitleiste festhalten
export async function syncAppointments(): Promise<SyncAppointmentsResult> {
  const mailbox = mailboxes()[0];
  if (!mailbox) return { read: 0, changed: false, logged: 0 };
  const runStart = new Date();
  const today = todayIso();
  const from = berlinDayStart(addDaysIso(today, -BACK_DAYS));
  const to = berlinDayStart(addDaysIso(today, AHEAD_DAYS));
  await db
    .insert(appState)
    .values({ key: STATE_KEY, value: runStart.toISOString() })
    .onDuplicateKeyUpdate({ set: { value: runStart.toISOString() } });

  const select = "subject,start,end,isAllDay,isCancelled,responseStatus,location,attendees,organizer,webLink,onlineMeeting,bodyPreview,showAs";
  let url: string | undefined =
    `/users/${encodeURIComponent(mailbox)}/calendarView?startDateTime=${from.toISOString()}&endDateTime=${to.toISOString()}` +
    `&$select=${select}&$orderby=start/dateTime&$top=100`;
  const events: GraphEvent[] = [];
  while (url) {
    const page: { value: GraphEvent[]; "@odata.nextLink"?: string } = await graphGet(url, {
      prefer: 'outlook.timezone="Europe/Berlin"',
      permission: "Calendars.Read",
    });
    events.push(...page.value);
    url = page["@odata.nextLink"];
  }
  const visible = events.filter((e) => !e.isCancelled && e.responseStatus?.response !== "declined");

  const existing = new Map(
    (await db.select().from(calendarEvents).where(and(eq(calendarEvents.mailbox, mailbox), lt(calendarEvents.startAt, to), gte(calendarEvents.endAt, from)))).map((r) => [r.graphId, r]),
  );
  const dealIds = [...new Set(visible.map(productionDealId).filter((x): x is number => x !== null))];
  const knownDeals = new Set(dealIds.length ? (await db.select({ id: deals.id }).from(deals).where(inArray(deals.id, dealIds))).map((d) => d.id) : []);

  let changed = false;
  // Produktionstermine, die in Outlook von „Mit Vorbehalt“ auf „Gebucht“ gestellt wurden
  const bookedInOutlook = new Set<number>();
  for (const e of visible) {
    const attendees = externalAttendees(e);
    const prodDeal = productionDealId(e);
    const dealId = prodDeal !== null && knownDeals.has(prodDeal) ? prodDeal : null;
    const old = existing.get(e.id);
    const match = dealId || old?.manual ? null : await matchAttendees(attendees);
    const fields = {
      subject: (e.subject?.trim() || "(ohne Betreff)").slice(0, 500),
      startAt: fromBerlin(e.start.dateTime),
      endAt: fromBerlin(e.end.dateTime),
      allDay: !!e.isAllDay,
      location: e.location?.displayName?.trim().slice(0, 500) || null,
      joinUrl: joinUrlOf(e),
      webLink: e.webLink ?? null,
      attendees: attendees.length ? JSON.stringify(attendees) : null,
      dealId,
      showAs: e.showAs?.slice(0, 20) ?? null,
      ...(match && { companyId: match.companyId, personId: match.personId }),
    };
    // Nur der Wechsel zählt, nicht der Zustand: so bestätigen alte, schon gebuchte Termine nichts
    if (dealId && old?.showAs === "tentative" && (e.showAs === "busy" || e.showAs === "oof")) bookedInOutlook.add(dealId);
    if (!old) {
      await db.insert(calendarEvents).values({ mailbox, graphId: e.id, ...fields, seenAt: runStart });
      changed = true;
      continue;
    }
    const differs = (Object.keys(fields) as (keyof typeof fields)[]).some((k) => {
      const a = fields[k];
      const b = old[k];
      return a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : (a ?? null) !== (b ?? null);
    });
    changed ||= differs;
    await db.update(calendarEvents).set({ ...fields, seenAt: runStart }).where(eq(calendarEvents.id, old.id));
  }

  for (const dealId of bookedInOutlook) {
    try {
      if (await confirmFromOutlook(dealId)) changed = true;
    } catch (e) {
      console.error(`Bestätigung aus Outlook für Vorgang ${dealId} fehlgeschlagen:`, e);
    }
  }

  // In Outlook gelöscht, abgesagt oder abgelehnt: verschwindet, außer er steht schon in der Zeitleiste
  const gone = [...existing.values()].filter((r) => !r.logged && !visible.some((e) => e.id === r.graphId)).map((r) => r.id);
  if (gone.length) {
    await db.delete(calendarEvents).where(inArray(calendarEvents.id, gone));
    changed = true;
  }
  await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.logged, false), lt(calendarEvents.endAt, new Date(Date.now() - KEEP_DAYS * 86_400_000))));

  const logged = await logPastAppointments();
  return { read: visible.length, changed: changed || logged > 0, logged };
}

// In Outlook auf „Gebucht“ gestellt: Anfrage/Angebot → Beauftragt, wie der Schalter auf der Startseite.
// Nur in diese Richtung; zurück auf „Mit Vorbehalt“ ändert die Phase nicht (der Abgleich stellt den Termin wieder auf gebucht).
async function confirmFromOutlook(dealId: number): Promise<boolean> {
  const [deal] = await db.select({ stage: deals.stage }).from(deals).where(eq(deals.id, dealId));
  if (deal?.stage !== "anfrage" && deal?.stage !== "angebot") return false;
  await changeStage(dealId, "beauftragt");
  // Zeitleiste: woher die Bestätigung kam
  const [entry] = await db
    .select({ id: activities.id, body: activities.body })
    .from(activities)
    .where(and(eq(activities.dealId, dealId), eq(activities.type, "phase")))
    .orderBy(sql`${activities.id} desc`)
    .limit(1);
  if (entry) await db.update(activities).set({ body: `${entry.body} (in Outlook auf „Gebucht“ gestellt)` }).where(eq(activities.id, entry.id));
  return true;
}

// Beim Öffnen der Startseite: nur lesen, wenn der letzte Abruf länger her ist
export async function appointmentsStale(): Promise<boolean> {
  if (!mailboxes().length) return false;
  const [row] = await db.select({ value: appState.value }).from(appState).where(eq(appState.key, STATE_KEY));
  return !row?.value || Date.now() - Date.parse(row.value) > STALE_MS;
}

// Termin festhalten: Eintrag „Termin“ in der Zeitleiste der Firma, mit der Person, zum Beginn des Termins
async function logAppointment(row: typeof calendarEvents.$inferSelect) {
  if (!row.companyId) return;
  const [inserted] = await db.insert(activities).values({ companyId: row.companyId, type: "termin", body: row.subject, createdAt: row.startAt });
  if (row.personId) await db.insert(activityPeople).values({ activityId: inserted.insertId, personId: row.personId });
  await db.update(calendarEvents).set({ logged: true, activityId: inserted.insertId }).where(eq(calendarEvents.id, row.id));
}

// Vergangene Kundentermine (nicht die eigenen Produktionstermine) einmal in die Zeitleiste
async function logPastAppointments(): Promise<number> {
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(isNotNull(calendarEvents.companyId), isNull(calendarEvents.dealId), eq(calendarEvents.logged, false), lte(calendarEvents.endAt, new Date())));
  for (const r of rows) await logAppointment(r);
  return rows.length;
}

export type Appointment = {
  id: number;
  subject: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  joinUrl: string | null;
  webLink: string | null;
  dealId: number | null;
  // Phase des Vorgangs bei eigenen Produktionsterminen (Anfrage/Angebot = nur reserviert)
  dealStage: Stage | null;
  companyId: number | null;
  companyName: string | null;
  personId: number | null;
  personName: string | null;
  // Kundentermin ohne Treffer: Teilnehmer vorhanden oder nicht, Firma lässt sich von Hand wählen
  attendees: Attendee[];
};

async function withNames(rows: (typeof calendarEvents.$inferSelect)[]): Promise<Appointment[]> {
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is number => !!x))];
  const personIds = [...new Set(rows.map((r) => r.personId).filter((x): x is number => !!x))];
  const companyNames = new Map(
    companyIds.length ? (await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds))).map((c) => [c.id, c.name.trim()]) : [],
  );
  const dealIds = [...new Set(rows.map((r) => r.dealId).filter((x): x is number => !!x))];
  const dealStages = new Map(
    dealIds.length ? (await db.select({ id: deals.id, stage: deals.stage }).from(deals).where(inArray(deals.id, dealIds))).map((d) => [d.id, d.stage]) : [],
  );
  const personNames = new Map(
    personIds.length ? (await db.select().from(people).where(inArray(people.id, personIds))).map((p) => [p.id, fullName(p)]) : [],
  );
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    startAt: r.startAt,
    endAt: r.endAt,
    allDay: r.allDay,
    location: r.location,
    joinUrl: r.joinUrl,
    webLink: r.webLink,
    dealId: r.dealId,
    dealStage: r.dealId ? dealStages.get(r.dealId) ?? null : null,
    companyId: r.companyId,
    companyName: r.companyId ? companyNames.get(r.companyId) ?? null : null,
    personId: r.personId,
    personName: r.personId ? personNames.get(r.personId) ?? null : null,
    attendees: r.attendees ? (JSON.parse(r.attendees) as Attendee[]) : [],
  }));
}

// Startseite: heute und die nächsten 7 Tage
export async function upcomingAppointments(days = 7): Promise<Appointment[]> {
  const today = todayIso();
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(lt(calendarEvents.startAt, berlinDayStart(addDaysIso(today, days + 1))), gte(calendarEvents.endAt, berlinDayStart(today))))
    .orderBy(asc(calendarEvents.startAt));
  return withNames(rows);
}

// Nächster Termin mit einer Firma bzw. Person
export async function nextAppointment(by: { companyId: number } | { personId: number }): Promise<Appointment | null> {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and("companyId" in by ? eq(calendarEvents.companyId, by.companyId) : eq(calendarEvents.personId, by.personId), gte(calendarEvents.endAt, new Date())))
    .orderBy(asc(calendarEvents.startAt))
    .limit(1);
  return row ? (await withNames([row]))[0] : null;
}

export type ReviewItem = Appointment & { projects: { id: number; title: string }[] };

// „Wie war der Call?“: vergangene Kundentermine der letzten Tage ohne Antwort
export async function reviewQuestions(): Promise<ReviewItem[]> {
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        isNotNull(calendarEvents.companyId),
        isNull(calendarEvents.dealId),
        isNull(calendarEvents.reviewedAt),
        eq(calendarEvents.logged, true),
        gte(calendarEvents.endAt, new Date(Date.now() - REVIEW_DAYS * 86_400_000)),
      ),
    )
    .orderBy(asc(calendarEvents.startAt));
  const items = await withNames(rows);
  const companyIds = [...new Set(items.map((i) => i.companyId!))];
  const open = companyIds.length
    ? await db
        .select({ id: deals.id, title: deals.title, companyId: deals.companyId })
        .from(deals)
        .where(and(inArray(deals.companyId, companyIds), notInArray(deals.stage, ["bezahlt", "verloren"])))
        .orderBy(sql`${deals.stageChangedAt} desc`)
    : [];
  return items.map((i) => ({ ...i, projects: open.filter((d) => d.companyId === i.companyId).map(({ id, title }) => ({ id, title })) }));
}

// Firma von Hand zuordnen; Person nur, wenn ein Teilnehmer ein bekannter Kontakt dieser Firma ist
export async function assignAppointment(eventId: number, companyId: number | null) {
  const [row] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId));
  if (!row || row.dealId) return;
  const attendees: Attendee[] = row.attendees ? JSON.parse(row.attendees) : [];
  const personId = companyId ? (await matchAttendees(attendees, companyId)).personId : null;
  await db.update(calendarEvents).set({ companyId, personId, manual: companyId !== null }).where(eq(calendarEvents.id, eventId));
  if (companyId && !row.logged && row.endAt <= new Date()) await logAppointment({ ...row, companyId, personId });
}

// Antwort auf „Wie war der Call?“: Notiz an den Zeitleisten-Eintrag, optional Vorgang und Nachfass-Aufgabe
export async function reviewAppointment(eventId: number, answer: { note?: string; dealId?: number | null; followUp?: string | null }) {
  const [row] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, eventId));
  if (!row) return;
  const dealId = answer.dealId && row.companyId
    ? ((await db.select({ id: deals.id }).from(deals).where(and(eq(deals.id, answer.dealId), eq(deals.companyId, row.companyId))))[0]?.id ?? null)
    : null;
  const note = answer.note?.trim();
  if (note || dealId) {
    const [activity] = row.activityId ? await db.select().from(activities).where(eq(activities.id, row.activityId)) : [];
    if (activity) {
      await db
        .update(activities)
        .set({ ...(note && { body: `${row.subject}\n\n${note}` }), ...(dealId && { dealId }) })
        .where(eq(activities.id, activity.id));
    } else if (row.companyId) {
      const [inserted] = await db
        .insert(activities)
        .values({ companyId: row.companyId, dealId, type: "termin", body: note ? `${row.subject}\n\n${note}` : row.subject, createdAt: row.startAt });
      if (row.personId) await db.insert(activityPeople).values({ activityId: inserted.insertId, personId: row.personId });
      await db.update(calendarEvents).set({ logged: true, activityId: inserted.insertId }).where(eq(calendarEvents.id, row.id));
    }
  }
  if (answer.followUp && /^\d{4}-\d{2}-\d{2}$/.test(answer.followUp) && row.companyId) {
    const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, row.companyId));
    const [task] = await db.insert(tasks).values({
      title: `${company ? `${company.name.trim()}: ` : ""}nachfassen – ${row.subject}`.slice(0, 255),
      dueDate: answer.followUp,
      companyId: row.companyId,
      dealId,
    });
    if (row.personId) await db.insert(taskPeople).values({ taskId: task.insertId, personId: row.personId });
  }
  await db.update(calendarEvents).set({ reviewedAt: new Date() }).where(eq(calendarEvents.id, eventId));
}
