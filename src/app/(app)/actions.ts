"use server";

import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { activities, appState, companies, contacts, deals, emails, LOST_REASONS, mailIgnore, productionDays, STAGES, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { suggestFolderName, tidyMailText, todayIso } from "@/lib/format";
import { importLexwareCustomers, domainOf, type ImportResult } from "@/lib/lexware";
import { matchAddress, rematchOpenMails, syncMailboxes, type SyncResult } from "@/lib/mail";
import { graphSend, mailboxes, messageText } from "@/lib/graph";
import { deleteDealEvents, syncDealCalendar } from "@/lib/calendar";
import { parseSignature, type SignatureData } from "@/lib/signature";
import { sendDigest } from "@/lib/digest";
import { linkVoucher, quickReconcile, reconcileDeals, syncVouchers } from "@/lib/lexware-sync";
import { createQuotationDraft } from "@/lib/lexware-draft";
import { saveAutoReplySettings } from "@/lib/autoreply";
import { pickTags, saveServiceTagOptions } from "@/lib/service-tags";
import { changeStage, createDeal } from "@/lib/pipeline";
import { projectsFor, type ProjectOption } from "@/lib/queries";
import { hintProps, ratingFor } from "@/lib/rating";
import { autocomplete, placeDetails, resolveAddress, type Place } from "@/lib/places";

export type FormState = { error?: string } | undefined;

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const amount = optionalText.transform((v) => {
  if (!v) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n.toFixed(2) : null;
});

function text(form: FormData, key: string) {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

// Firma per ID oder per Name; ein unbekannter Name legt die Firma neu an
async function resolveCompany(form: FormData): Promise<number | null> {
  const id = Number(text(form, "companyId"));
  if (id) return id;
  const name = text(form, "companyName")?.trim();
  if (!name) return null;
  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.name, name));
  if (existing) return existing.id;
  const kindValue = form.get("kind");
  const kind = kindValue === "dienstleister" || kindValue === "wettbewerber" ? kindValue : "kunde";
  const [inserted] = await db.insert(companies).values({
    name,
    kind,
    tags: kind === "dienstleister" ? await pickTags(form.getAll("tags").map(String)) : null,
    folderName: kind === "kunde" ? suggestFolderName(name) : null,
  });
  return inserted.insertId;
}


const dealSchema = z.object({
  title: z.string().trim().min(1, "Bitte beschreiben, worum es geht."),
  stage: z.enum(STAGES),
  amountNet: amount,
  projectDate: optionalText,
  notes: optionalText,
});

export async function createDealAction(_: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const parsed = dealSchema.safeParse({
    title: text(form, "title"),
    stage: text(form, "stage") ?? "anfrage",
    amountNet: text(form, "amountNet"),
    projectDate: text(form, "projectDate"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const companyId = await resolveCompany(form);
  if (!companyId) return { error: "Bitte eine Firma auswählen oder neu eingeben." };

  const quick = form.get("quick") === "1";
  const mailId = Number(text(form, "mailId")) || null;
  const [mail] = mailId ? await db.select().from(emails).where(eq(emails.id, mailId)) : [];
  const id = await createDeal({
    ...parsed.data,
    companyId,
    contactId: Number(text(form, "contactId")) || mail?.contactId || null,
    compareOnly: form.get("compareOnly") === "on",
    quick,
  });
  // Vorgang aus einer Mail oder Notiz: der Eintrag hängt danach am Vorgang
  if (mail) {
    await db.update(emails).set({ companyId, status: "zugeordnet" }).where(eq(emails.id, mail.id));
    await assignMailToDeal(mail.id, id);
  }
  const activityId = Number(text(form, "activityId")) || null;
  if (activityId) {
    await db.update(activities).set({ dealId: id }).where(and(eq(activities.id, activityId), eq(activities.companyId, companyId)));
  }
  // Schnellauftrag ist sofort beauftragt: gleich die Produktion planen
  redirect(quick ? `/vorgaenge/${id}?planen=1` : `/vorgaenge/${id}`);
}

export async function updateDealAction(dealId: number, _: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const parsed = dealSchema.omit({ stage: true }).safeParse({
    title: text(form, "title"),
    amountNet: text(form, "amountNet"),
    projectDate: text(form, "projectDate"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db
    .update(deals)
    .set({
      ...parsed.data,
      offerNumber: text(form, "offerNumber")?.trim() || null,
      invoiceNumber: text(form, "invoiceNumber")?.trim() || null,
      compareOnly: form.get("compareOnly") === "on",
    })
    .where(eq(deals.id, dealId));
  refresh();
  return {};
}

export async function moveDealAction(
  dealId: number,
  stage: (typeof STAGES)[number],
  lost?: { reason: (typeof LOST_REASONS)[number]; note?: string; competitor?: string },
) {
  await getCurrentUser();
  z.enum(STAGES).parse(stage);
  if (lost) z.enum(LOST_REASONS).parse(lost.reason);
  await changeStage(dealId, stage, lost && { reason: lost.reason, note: lost.note });
  if (stage === "verloren" && lost?.competitor?.trim()) {
    await db.update(deals).set({ competitorId: await resolveCompetitor(lost.competitor) }).where(eq(deals.id, dealId));
  }
  if (stage === "verloren") await syncDealCalendar(dealId);
  // Gleich in Lexware nach passendem Angebot bzw. Rechnung schauen, statt auf den nächsten Cronjob zu warten
  if (["angebot", "beauftragt", "erledigt"].includes(stage)) {
    try {
      await quickReconcile();
    } catch (e) {
      console.error("Lexware-Abgleich nach Phasenwechsel fehlgeschlagen:", e);
    }
  }
  refresh();
}

// Wettbewerber per Name finden oder als neue Firma der Art „wettbewerber“ anlegen
async function resolveCompetitor(name: string): Promise<number> {
  const clean = name.trim().slice(0, 255);
  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.name, clean));
  if (existing) return existing.id;
  const [inserted] = await db.insert(companies).values({ name: clean, kind: "wettbewerber" });
  return inserted.insertId;
}

// Wettbewerber eines verlorenen Vorgangs nachtragen oder ändern (leer = entfernen)
export async function setCompetitorAction(dealId: number, _: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const name = text(form, "competitor")?.trim();
  await db.update(deals).set({ competitorId: name ? await resolveCompetitor(name) : null }).where(eq(deals.id, dealId));
  refresh();
  return {};
}

// Eigene Sterne-Bewertung einer Firma; null = Vorschlag der App gilt wieder
export async function setRatingAction(companyId: number, rating: number | null, note: string | null) {
  await getCurrentUser();
  const value = rating === null ? null : Math.max(0, Math.min(5, Math.round(rating)));
  await db
    .update(companies)
    .set({ rating: value, ratingNote: value === null ? null : note?.trim() || null })
    .where(eq(companies.id, companyId));
  refresh();
}

export async function renameDealAction(dealId: number, title: string): Promise<{ error?: string }> {
  await getCurrentUser();
  const clean = title.trim().slice(0, 255);
  if (!clean) return { error: "Der Name darf nicht leer sein." };
  await db.update(deals).set({ title: clean }).where(eq(deals.id, dealId));
  refresh();
  return {};
}

export async function renameCompanyAction(companyId: number, name: string): Promise<{ error?: string }> {
  await getCurrentUser();
  const clean = name.trim().slice(0, 255);
  if (!clean) return { error: "Der Name darf nicht leer sein." };
  await db.update(companies).set({ name: clean }).where(eq(companies.id, companyId));
  refresh();
  return {};
}

// Drehort mit Adresse und Koordinaten (aus der Adresssuche)
export type PlaceGeo = Omit<Place, "label" | "website">;
// Vorschlag aus eigenen Daten; ohne Koordinaten wird er beim Auswählen über Google bestätigt
export type LocalPlace = { label: string; hint: string; geo: PlaceGeo | null };

export type Planning = {
  location: string;
  place: PlaceGeo | null;
  localPlaces: LocalPlace[];
  days: { id?: number; day: string; startTime: string; endTime: string }[];
  postStart: string | null;
  postEnd: string | null;
  blockContinuous: boolean;
  calendarError?: string | null;
};

// Planung eines Vorgangs; als Drehort werden zuerst die Firmenadresse und frühere Drehorte vorgeschlagen
export async function loadPlanningAction(dealId: number): Promise<Planning | null> {
  await getCurrentUser();
  const [row] = await db
    .select({ deal: deals, company: companies.name, street: companies.street, zip: companies.zip, city: companies.city })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(deals.id, dealId));
  if (!row) return null;
  const days = await db.select().from(productionDays).where(eq(productionDays.dealId, dealId)).orderBy(asc(productionDays.day), asc(productionDays.startTime));
  const { deal } = row;

  const localPlaces: LocalPlace[] = [];
  const companyAddress = [row.street, [row.zip, row.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (row.street && row.city) localPlaces.push({ label: `${row.company}, ${companyAddress}`, hint: "Firmenadresse", geo: null });
  const earlier = await db
    .select({ deal: deals, company: companies.name })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(isNotNull(deals.locationLat))
    .orderBy(desc(deals.updatedAt))
    .limit(60);
  for (const e of earlier) {
    if (!e.deal.location || localPlaces.some((p) => p.label === e.deal.location)) continue;
    localPlaces.push({ label: e.deal.location, hint: e.deal.id === dealId ? "dieser Vorgang" : `zuletzt bei ${e.company}`, geo: geoOf(e.deal) });
  }

  return {
    location: deal.location ?? "",
    place: geoOf(deal),
    localPlaces,
    days: days.map((d) => ({ id: d.id, day: d.day, startTime: d.startTime, endTime: d.endTime })),
    postStart: row.deal.postStart,
    postEnd: row.deal.postEnd,
    blockContinuous: row.deal.blockContinuous,
    calendarError: row.deal.calendarError,
  };
}

function geoOf(deal: typeof deals.$inferSelect): PlaceGeo | null {
  if (deal.locationLat === null || deal.locationLng === null) return null;
  return { street: deal.locationStreet, zip: deal.locationZip, city: deal.locationCity, country: deal.locationCountry, lat: deal.locationLat, lng: deal.locationLng };
}

const planningSchema = z.object({
  location: z.string().trim().max(500),
  place: z
    .object({
      street: z.string().max(255).nullable(),
      zip: z.string().max(16).nullable(),
      city: z.string().max(120).nullable(),
      country: z.string().length(2).nullable(),
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable(),
  days: z
    .array(
      z
        .object({
          id: z.number().optional(),
          day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte für jeden Produktionstag ein Datum angeben."),
          startTime: z.string().regex(/^\d{2}:\d{2}$/, "Bitte Uhrzeiten angeben."),
          endTime: z.string().regex(/^\d{2}:\d{2}$/, "Bitte Uhrzeiten angeben."),
        })
        .refine((d) => d.endTime > d.startTime, "Das Ende muss nach dem Beginn liegen."),
    )
    .max(60),
  postStart: z.string().nullable(),
  postEnd: z.string().nullable(),
  blockContinuous: z.boolean(),
});

export async function savePlanningAction(dealId: number, input: Planning): Promise<{ error?: string; calendarError?: string | null }> {
  await getCurrentUser();
  const parsed = planningSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const data = parsed.data;
  if (data.postStart && data.postEnd && data.postEnd < data.postStart) return { error: "Der Zieltag der Postproduktion liegt vor dem Starttag." };

  const existing = await db.select().from(productionDays).where(eq(productionDays.dealId, dealId));
  const keep = new Set(data.days.map((d) => d.id).filter(Boolean));
  // Entfernte Tage: Termin löschen, dann Zeile löschen
  for (const old of existing.filter((e) => !keep.has(e.id))) {
    if (old.eventId) {
      try {
        await graphSend("DELETE", `/users/${encodeURIComponent(mailboxes()[0])}/events/${encodeURIComponent(old.eventId)}`);
      } catch (e) {
        console.error("Kalendertermin konnte nicht gelöscht werden:", e);
      }
    }
    await db.delete(productionDays).where(eq(productionDays.id, old.id));
  }
  for (const d of data.days) {
    const values = { day: d.day, startTime: d.startTime, endTime: d.endTime };
    if (d.id && existing.some((e) => e.id === d.id)) await db.update(productionDays).set(values).where(eq(productionDays.id, d.id));
    else await db.insert(productionDays).values({ ...values, dealId });
  }
  const firstDay = [...data.days].sort((a, b) => a.day.localeCompare(b.day))[0]?.day;
  await db
    .update(deals)
    .set({
      location: data.location || null,
      // Koordinaten nur zusammen mit einem Drehort; Freitext hat keine
      locationStreet: data.location && data.place ? data.place.street : null,
      locationZip: data.location && data.place ? data.place.zip : null,
      locationCity: data.location && data.place ? data.place.city : null,
      locationCountry: data.location && data.place ? data.place.country : null,
      locationLat: data.location && data.place ? data.place.lat : null,
      locationLng: data.location && data.place ? data.place.lng : null,
      postStart: data.postStart || null,
      postEnd: data.postEnd || null,
      blockContinuous: data.blockContinuous,
      // Projektdatum (und Ordnername) folgen dem ersten Produktionstag
      ...(firstDay && { projectDate: firstDay }),
    })
    .where(eq(deals.id, dealId));
  await syncDealCalendar(dealId);
  const [after] = await db.select({ e: deals.calendarError }).from(deals).where(eq(deals.id, dealId));
  refresh();
  return { calendarError: after?.e ?? null };
}

// Adresssuche (Google Places); null heißt: keine Vorschläge, von Hand tippen
export async function placeSearchAction(input: string, sessionToken: string) {
  await getCurrentUser();
  return autocomplete(input.slice(0, 200), sessionToken.slice(0, 64));
}

export async function placeDetailsAction(placeId: string, sessionToken: string, name: string, withWebsite: boolean) {
  await getCurrentUser();
  return placeDetails(placeId, sessionToken.slice(0, 64), name.slice(0, 200), withWebsite);
}

export async function resolveAddressAction(text: string) {
  await getCurrentUser();
  return resolveAddress(text.slice(0, 300), "");
}

// Für Formulare mit gebundenen Argumenten (FormData wird ignoriert)
export async function advanceDealAction(dealId: number, stage: "angebot" | "beauftragt" | "erledigt" | "rechnung" | "bezahlt") {
  await moveDealAction(dealId, stage);
}

export async function deleteDealAction(dealId: number) {
  await getCurrentUser();
  await deleteDealEvents(dealId);
  await db.delete(deals).where(eq(deals.id, dealId));
  redirect("/vorgaenge");
}

const companySchema = z.object({
  name: z.string().trim().min(1, "Der Firmenname fehlt."),
  folderName: optionalText,
  street: optionalText,
  zip: optionalText,
  city: optionalText,
  website: optionalText,
  phone: optionalText,
  email: optionalText,
  emailDomain: optionalText,
  industry: optionalText,
  notes: optionalText,
  kind: z.enum(["kunde", "dienstleister", "wettbewerber"]).catch("kunde"),
});

async function companyValues(form: FormData) {
  const parsed = companySchema.safeParse(
    Object.fromEntries(Object.keys(companySchema.shape).map((k) => [k, text(form, k)])),
  );
  if (!parsed.success) return parsed;
  const tags = parsed.data.kind === "dienstleister" ? await pickTags(form.getAll("tags").map(String)) : null;
  return { ...parsed, data: { ...parsed.data, tags } };
}

export async function createCompanyAction(_: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const parsed = await companyValues(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [inserted] = await db.insert(companies).values({
    ...parsed.data,
    folderName: parsed.data.folderName ?? suggestFolderName(parsed.data.name),
    emailDomain: parsed.data.emailDomain?.toLowerCase().replace(/^@/, "") ?? null,
  });
  redirect(`/firmen/${inserted.insertId}`);
}

export async function updateCompanyAction(companyId: number, _: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const parsed = await companyValues(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db
    .update(companies)
    .set({ ...parsed.data, emailDomain: parsed.data.emailDomain?.toLowerCase().replace(/^@/, "") ?? null })
    .where(eq(companies.id, companyId));
  refresh();
  return {};
}

export async function createContactAction(companyId: number | null, _: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const lastName = text(form, "lastName")?.trim();
  if (!lastName) return { error: "Der Nachname fehlt." };
  const email = text(form, "email")?.trim() || null;
  const targetCompany = companyId ?? (Number(text(form, "companyId")) || null);
  await db.insert(contacts).values({
    companyId: targetCompany,
    firstName: text(form, "firstName")?.trim() || null,
    lastName,
    email,
    phone: text(form, "phone")?.trim() || null,
    mobile: text(form, "mobile")?.trim() || null,
    position: text(form, "position")?.trim() || null,
  });
  // Erste bekannte Firmen-Domain gleich mitlernen
  if (targetCompany && domainOf(email)) {
    const [company] = await db.select({ d: companies.emailDomain }).from(companies).where(eq(companies.id, targetCompany));
    if (company && !company.d) {
      await db.update(companies).set({ emailDomain: domainOf(email) }).where(eq(companies.id, targetCompany));
    }
  }
  refresh();
  return {};
}

export async function addActivityAction(
  target: { companyId: number | null; dealId: number | null },
  _: FormState,
  form: FormData,
): Promise<FormState> {
  await getCurrentUser();
  const body = text(form, "body")?.trim();
  if (!body) return { error: "Bitte etwas eintragen." };
  const type = form.get("type") === "anruf" ? "anruf" : "notiz";
  // Auf der Firmenseite kommt das Projekt aus den Pills („Nur Firma“ = leer)
  const dealId = target.dealId ?? (await dealOfCompany(Number(text(form, "dealId")) || null, target.companyId));
  await db.insert(activities).values({ ...target, dealId, type, body });
  refresh();
  return {};
}

// Gehört der Vorgang zur Firma? Sonst keine Zuordnung
async function dealOfCompany(dealId: number | null, companyId: number | null): Promise<number | null> {
  if (!dealId || !companyId) return null;
  const [deal] = await db.select({ companyId: deals.companyId }).from(deals).where(eq(deals.id, dealId));
  return deal?.companyId === companyId ? dealId : null;
}

// Mail einem Projekt zuordnen, umhängen oder lösen. Eine Unterhaltung gehört immer geschlossen zu einem Projekt:
// alle Mails desselben Verlaufs bei derselben Firma bekommen dieselbe Zuordnung.
async function assignMailToDeal(mailId: number, dealId: number | null) {
  const [mail] = await db.select().from(emails).where(eq(emails.id, mailId));
  if (!mail) return;
  const target = await dealOfCompany(dealId, mail.companyId);
  if (mail.conversationId && mail.companyId) {
    await db
      .update(emails)
      .set({ dealId: target })
      .where(and(eq(emails.conversationId, mail.conversationId), eq(emails.companyId, mail.companyId)));
  } else {
    await db.update(emails).set({ dealId: target }).where(eq(emails.id, mailId));
  }
}

// Eintrag im Verlauf einem Projekt zuordnen, umhängen oder lösen (dealId = null)
export async function assignEntryAction(entry: { kind: "mail" | "activity"; id: number }, dealId: number | null) {
  await getCurrentUser();
  if (entry.kind === "mail") {
    await assignMailToDeal(entry.id, dealId);
  } else {
    const [activity] = await db.select().from(activities).where(eq(activities.id, entry.id));
    if (!activity || activity.type === "phase") return;
    await db.update(activities).set({ dealId: await dealOfCompany(dealId, activity.companyId) }).where(eq(activities.id, entry.id));
  }
  refresh();
}

export async function createTaskAction(_: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const title = text(form, "title")?.trim();
  if (!title) return { error: "Bitte die Aufgabe beschreiben." };
  await db.insert(tasks).values({
    title,
    dueDate: text(form, "dueDate") || null,
    companyId: Number(text(form, "companyId")) || null,
    dealId: Number(text(form, "dealId")) || null,
  });
  refresh();
  return {};
}

export async function toggleTaskAction(taskId: number, done: boolean) {
  await getCurrentUser();
  await db.update(tasks).set({ doneAt: done ? new Date() : null }).where(eq(tasks.id, taskId));
  refresh();
}

export async function syncMailAction(): Promise<SyncResult | { error: string }> {
  await getCurrentUser();
  try {
    const result = await syncMailboxes();
    refresh();
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Abruf fehlgeschlagen" };
  }
}

// Volltext einer Mail für die Zeitleiste
export async function mailTextAction(mailId: number): Promise<{ text: string } | { error: string }> {
  await getCurrentUser();
  const [mail] = await db.select({ mailbox: emails.mailbox, graphId: emails.graphId }).from(emails).where(eq(emails.id, mailId));
  if (!mail) return { error: "Mail nicht gefunden." };
  try {
    const { unique, full } = await messageText(mail.mailbox, mail.graphId);
    return { text: tidyMailText(unique || full) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mail konnte nicht geladen werden." };
  }
}

export type MailForContact = {
  text: string;
  suggestion: SignatureData & { email: string };
  company: { id: number; name: string } | null;
  projects: ProjectOption[];
  hint: ReturnType<typeof hintProps> | null;
};

// Volltext der Mail holen und Kontaktdaten aus der Signatur vorschlagen
export async function loadMailForContactAction(mailId: number): Promise<MailForContact | { error: string }> {
  await getCurrentUser();
  const [mail] = await db.select().from(emails).where(eq(emails.id, mailId));
  if (!mail) return { error: "Mail nicht gefunden." };
  try {
    const { full, unique } = await messageText(mail.mailbox, mail.graphId);
    const address = mail.outgoing ? mail.toAddresses?.split(",")[0]?.trim() ?? "" : mail.fromAddress ?? "";
    // Bei gesendeten Mails steht unten die eigene Signatur, daher nur die Empfängeradresse auswerten
    const suggestion = parseSignature(mail.outgoing ? "" : unique, { name: mail.outgoing ? null : mail.fromName, address });
    const match = await matchAddress(address);
    const [company] = match
      ? await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, match.companyId))
      : [];
    const projects = company ? (await projectsFor(company.id)).filter((p) => p.active) : [];
    const rating = company ? await ratingFor(company.id) : null;
    const hint = rating && rating.rating.stars !== null && rating.rating.stars <= 2 ? hintProps(rating) : null;
    return { text: tidyMailText(full), suggestion: { ...suggestion, email: address }, company: company ?? null, projects, hint };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Mail konnte nicht geladen werden." };
  }
}

// Kontakt (und bei Bedarf Firma oder Dienstleister) aus einer Mail anlegen und die Mail zuordnen.
// Vorhandene Einträge werden nur ergänzt, nie überschrieben.
export async function createContactFromMailAction(mailId: number, _: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const lastName = text(form, "lastName")?.trim();
  if (!lastName) return { error: "Der Nachname fehlt." };
  const companyId = await resolveCompany(form);
  if (!companyId) return { error: "Bitte eine Firma bzw. den Namen des Dienstleisters angeben." };
  const value = (key: string) => text(form, key)?.trim() || null;
  const email = value("email")?.toLowerCase() ?? null;

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  const fill: Partial<typeof companies.$inferInsert> = {};
  for (const key of ["website", "street", "zip", "city"] as const) if (!company[key] && value(key)) fill[key] = value(key);
  if (form.get("learnDomain") === "on" && !company.emailDomain && domainOf(email)) fill.emailDomain = domainOf(email);
  if (Object.keys(fill).length) await db.update(companies).set(fill).where(eq(companies.id, companyId));

  const person = {
    firstName: value("firstName"),
    lastName,
    position: value("position"),
    phone: value("phone"),
    mobile: value("mobile"),
  };
  const [known] = email ? await db.select().from(contacts).where(eq(contacts.email, email)) : [];
  let contactId: number;
  if (known) {
    contactId = known.id;
    const update: Partial<typeof contacts.$inferInsert> = {};
    for (const key of ["firstName", "position", "phone", "mobile"] as const) if (!known[key] && person[key]) update[key] = person[key];
    if (!known.companyId) update.companyId = companyId;
    if (Object.keys(update).length) await db.update(contacts).set(update).where(eq(contacts.id, known.id));
  } else {
    const [inserted] = await db.insert(contacts).values({ ...person, companyId, email });
    contactId = inserted.insertId;
  }

  await db.update(emails).set({ companyId, contactId, status: "zugeordnet" }).where(eq(emails.id, mailId));
  await assignMailToDeal(mailId, Number(text(form, "dealId")) || null);
  await rematchOpenMails();
  refresh();
  return {};
}

export async function ignoreMailAction(mailId: number) {
  await getCurrentUser();
  await db.update(emails).set({ status: "ignoriert" }).where(eq(emails.id, mailId));
  refresh();
}

// Absender künftig ignorieren: bei Firmen-Domains die ganze Domain, sonst nur die Adresse
export async function ignoreSenderAction(mailId: number) {
  await getCurrentUser();
  const [mail] = await db.select().from(emails).where(eq(emails.id, mailId));
  if (!mail?.fromAddress) return;
  const pattern = domainOf(mail.fromAddress) ?? mail.fromAddress.toLowerCase();
  await db.insert(mailIgnore).values({ pattern }).onDuplicateKeyUpdate({ set: { pattern } });
  await db.update(emails).set({ status: "ignoriert" }).where(eq(emails.id, mailId));
  await rematchOpenMails();
  refresh();
}

export async function removeIgnoreAction(id: number) {
  await getCurrentUser();
  await db.delete(mailIgnore).where(eq(mailIgnore.id, id));
  refresh();
}

export async function taskFromMailAction(mailId: number) {
  await getCurrentUser();
  const [mail] = await db.select().from(emails).where(eq(emails.id, mailId));
  if (!mail) return;
  await db.insert(tasks).values({
    title: `Mail bearbeiten: ${mail.subject ?? "(ohne Betreff)"}`.slice(0, 255),
    dueDate: todayIso(),
    companyId: mail.companyId,
    dealId: mail.dealId,
  });
  if (mail.status === "neu" && mail.companyId) {
    await db.update(emails).set({ status: "zugeordnet" }).where(eq(emails.id, mailId));
  }
  refresh();
}

export async function linkVoucherAction(dealId: number, voucherId: string) {
  await getCurrentUser();
  await linkVoucher(dealId, voucherId);
  refresh();
}

const draftItem = z.object({
  name: z.string().trim().min(1, "Jede Position braucht eine Bezeichnung."),
  description: z.string().trim().optional(),
  quantity: z.number().positive("Menge muss größer als 0 sein."),
  unitName: z.string().trim().min(1),
  netPrice: z.number().min(0),
});

export async function createQuotationDraftAction(
  dealId: number,
  items: z.input<typeof draftItem>[],
): Promise<{ url: string } | { error: string }> {
  await getCurrentUser();
  const parsed = z.array(draftItem).min(1, "Mindestens eine Position angeben.").safeParse(items);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const url = await createQuotationDraft(dealId, parsed.data);
    refresh();
    return { url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Entwurf fehlgeschlagen" };
  }
}

export async function syncLexwareAction(): Promise<{ log: string[] } | { error: string }> {
  await getCurrentUser();
  try {
    await syncVouchers();
    const log = await reconcileDeals();
    refresh();
    return { log };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Abgleich fehlgeschlagen" };
  }
}

export async function sendDigestAction(): Promise<{ message: string } | { error: string }> {
  await getCurrentUser();
  try {
    const result = await sendDigest();
    return { message: result.sent ? `Montags-Mail mit ${result.total} Punkten verschickt.` : "Nichts offen, deshalb keine Mail." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Versand fehlgeschlagen" };
  }
}

export async function saveAutoReplyAction(_: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const domain = text(form, "domain")?.trim() ?? "";
  const body = text(form, "text")?.trim() ?? "";
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain.replace(/^@/, ""))) return { error: "Bitte eine gültige Domain angeben, z. B. bergander-film.de" };
  if (body.length < 20) return { error: "Der Antworttext ist zu kurz." };
  await saveAutoReplySettings({ enabled: form.get("enabled") === "on", domain, text: body });
  refresh();
  return {};
}

export async function saveServiceTagsAction(_: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const list = (text(form, "tags") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  if (!list.length) return { error: "Mindestens ein Gewerk angeben." };
  await saveServiceTagOptions(list);
  refresh();
  return {};
}

export async function saveFolderTemplateAction(_: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const value = (text(form, "template") ?? "")
    .split("\n")
    .map((l) => l.trim().replace(/^\/+|\/+$/g, ""))
    .filter((l) => l && !l.split("/").some((p) => p.trim() === ".." || p.trim() === "."))
    .join("\n");
  await db.insert(appState).values({ key: "folder_template", value }).onDuplicateKeyUpdate({ set: { value } });
  refresh();
  return {};
}

export async function importLexwareAction(): Promise<ImportResult | { error: string }> {
  await getCurrentUser();
  try {
    const result = await importLexwareCustomers();
    refresh();
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import fehlgeschlagen" };
  }
}
