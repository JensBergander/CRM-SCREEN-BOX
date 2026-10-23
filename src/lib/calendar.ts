import "server-only";
import { asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, deals, productionDays } from "@/db/schema";
import { graphSend, mailboxes } from "./graph";

// Produktionstermine eines Vorgangs im Kalender von office@ abbilden. Das CRM führt:
// Änderungen in Outlook werden nicht zurückgelesen, sondern beim nächsten Abgleich überschrieben.
const TZ = "W. Europe Standard Time";

function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Erinnerung am Vortag um 18 Uhr
function reminderMinutes(startTime: string) {
  return 24 * 60 - 18 * 60 + minutes(startTime);
}

const crmLink = (dealId: number) => `${process.env.APP_URL ?? "https://crm.screen-box.de"}/vorgaenge/${dealId}`;

function escape(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

type Context = {
  deal: typeof deals.$inferSelect;
  companyName: string;
  contact: { name: string; phone: string | null; email: string | null } | null;
};

// Mit Koordinaten zeigen Outlook und iPhone eine Karte und starten die Navigation
function eventLocation(deal: typeof deals.$inferSelect) {
  if (!deal.location) return undefined;
  if (deal.locationLat === null || deal.locationLng === null) return { displayName: deal.location };
  return {
    displayName: deal.location,
    locationType: "default",
    address: {
      street: deal.locationStreet ?? "",
      postalCode: deal.locationZip ?? "",
      city: deal.locationCity ?? "",
      countryOrRegion: deal.locationCountry ?? "",
    },
    coordinates: { latitude: deal.locationLat, longitude: deal.locationLng },
  };
}

function eventBody(ctx: Context, start: string, end: string, startTime: string) {
  const { deal } = ctx;
  const lines = [
    deal.number && `<b>Projekt:</b> ${escape(deal.number)}`,
    // kurzer Link über die Koordinaten: Apple Kalender zeigt Links als Text mit der ganzen Adresse dahinter
    deal.location && deal.locationLat !== null && deal.locationLng !== null &&
      `<b>Drehort:</b> ${escape(deal.location)} · <a href="https://maps.google.com/?q=${deal.locationLat.toFixed(6)},${deal.locationLng.toFixed(6)}">Route in Google Maps</a>`,
    ctx.contact && `<b>Ansprechpartner:</b> ${escape(ctx.contact.name)}${ctx.contact.phone ? `, ${escape(ctx.contact.phone)}` : ""}${ctx.contact.email ? `, ${escape(ctx.contact.email)}` : ""}`,
    deal.notes && `<b>Notiz:</b> ${escape(deal.notes).replace(/\n/g, "<br>")}`,
    `<a href="${crmLink(deal.id)}">Vorgang im CRM öffnen</a>`,
    `<span style="color:#6e6e73">Bitte Termine im CRM ändern, nicht hier. Änderungen in Outlook werden überschrieben.</span>`,
  ].filter(Boolean);
  return {
    subject: `Produktion: ${deal.title} · ${ctx.companyName}`,
    body: { contentType: "HTML", content: lines.join("<br>") },
    start: { dateTime: start, timeZone: TZ },
    end: { dateTime: end, timeZone: TZ },
    location: eventLocation(deal),
    showAs: "busy",
    isReminderOn: true,
    reminderMinutesBeforeStart: reminderMinutes(startTime),
  };
}

async function upsertEvent(mailbox: string, eventId: string | null, payload: object): Promise<string> {
  const base = `/users/${encodeURIComponent(mailbox)}/events`;
  if (eventId) {
    try {
      await graphSend("PATCH", `${base}/${encodeURIComponent(eventId)}`, payload);
      return eventId;
    } catch (e) {
      // in Outlook gelöscht: neu anlegen
      if (!(e instanceof Error && e.message.includes("not found"))) throw e;
    }
  }
  const created = await graphSend<{ id: string }>("POST", base, payload);
  return created!.id;
}

async function deleteEvent(mailbox: string, eventId: string | null) {
  if (eventId) await graphSend("DELETE", `/users/${encodeURIComponent(mailbox)}/events/${encodeURIComponent(eventId)}`);
}

// Kalender eines Vorgangs auf den Stand im CRM bringen; Fehler werden am Vorgang vermerkt und später erneut versucht
export async function syncDealCalendar(dealId: number): Promise<void> {
  const mailbox = mailboxes()[0];
  if (!mailbox) return;
  const [row] = await db
    .select({ deal: deals, companyName: companies.name })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(deals.id, dealId));
  if (!row) return;
  const days = await db.select().from(productionDays).where(eq(productionDays.dealId, dealId)).orderBy(asc(productionDays.day), asc(productionDays.startTime));
  const [contact] = row.deal.contactId ? await db.select().from(contacts).where(eq(contacts.id, row.deal.contactId)) : [];
  const ctx: Context = {
    deal: row.deal,
    companyName: row.companyName,
    contact: contact ? { name: [contact.firstName, contact.lastName].filter(Boolean).join(" "), phone: contact.mobile ?? contact.phone, email: contact.email } : null,
  };

  try {
    const active = row.deal.stage !== "verloren" && days.length > 0;
    if (!active || row.deal.blockContinuous) {
      for (const d of days) {
        await deleteEvent(mailbox, d.eventId);
        if (d.eventId) await db.update(productionDays).set({ eventId: null }).where(eq(productionDays.id, d.id));
      }
    }
    if (!active) {
      await deleteEvent(mailbox, row.deal.calendarEventId);
      await db.update(deals).set({ calendarEventId: null, calendarError: null }).where(eq(deals.id, dealId));
      return;
    }
    if (row.deal.blockContinuous) {
      const first = days[0];
      const last = days[days.length - 1];
      const id = await upsertEvent(
        mailbox,
        row.deal.calendarEventId,
        eventBody(ctx, `${first.day}T${first.startTime}:00`, `${last.day}T${last.endTime}:00`, first.startTime),
      );
      await db.update(deals).set({ calendarEventId: id, calendarError: null }).where(eq(deals.id, dealId));
      return;
    }
    await deleteEvent(mailbox, row.deal.calendarEventId);
    for (const d of days) {
      const id = await upsertEvent(mailbox, d.eventId, eventBody(ctx, `${d.day}T${d.startTime}:00`, `${d.day}T${d.endTime}:00`, d.startTime));
      if (id !== d.eventId) await db.update(productionDays).set({ eventId: id }).where(eq(productionDays.id, d.id));
    }
    await db.update(deals).set({ calendarEventId: null, calendarError: null }).where(eq(deals.id, dealId));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.update(deals).set({ calendarError: message.slice(0, 1000) }).where(eq(deals.id, dealId));
  }
}

// Termine eines Vorgangs löschen, bevor er selbst gelöscht wird
export async function deleteDealEvents(dealId: number) {
  const mailbox = mailboxes()[0];
  if (!mailbox) return;
  const [deal] = await db.select({ eventId: deals.calendarEventId }).from(deals).where(eq(deals.id, dealId));
  const days = await db.select({ eventId: productionDays.eventId }).from(productionDays).where(eq(productionDays.dealId, dealId));
  for (const id of [deal?.eventId ?? null, ...days.map((d) => d.eventId)]) {
    try {
      await deleteEvent(mailbox, id);
    } catch (e) {
      console.error("Kalendertermin konnte nicht gelöscht werden:", e);
    }
  }
}

// Für den Cronjob: Vorgänge mit fehlgeschlagenem Abgleich erneut versuchen
export async function retryCalendarSync(): Promise<number> {
  const failed = await db.select({ id: deals.id }).from(deals).where(isNotNull(deals.calendarError)).limit(10);
  for (const d of failed) await syncDealCalendar(d.id);
  return failed.length;
}
