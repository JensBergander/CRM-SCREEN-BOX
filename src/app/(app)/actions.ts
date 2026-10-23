"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { activities, appState, companies, contacts, deals, emails, LOST_REASONS, mailIgnore, STAGES, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { suggestFolderName, todayIso } from "@/lib/format";
import { importLexwareCustomers, domainOf, type ImportResult } from "@/lib/lexware";
import { rematchOpenMails, syncMailboxes, type SyncResult } from "@/lib/mail";
import { sendDigest } from "@/lib/digest";
import { linkVoucher, reconcileDeals, syncVouchers } from "@/lib/lexware-sync";
import { createQuotationDraft } from "@/lib/lexware-draft";
import { saveAutoReplySettings } from "@/lib/autoreply";
import { changeStage, createDeal } from "@/lib/pipeline";

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
  const [inserted] = await db.insert(companies).values({ name, folderName: suggestFolderName(name) });
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
  // Vorgang aus einer Mail: die Mail hängt danach am Vorgang
  if (mail) {
    await db.update(emails).set({ dealId: id, companyId, status: "zugeordnet" }).where(eq(emails.id, mail.id));
  }
  redirect(quick ? "/" : `/vorgaenge/${id}`);
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
  lost?: { reason: (typeof LOST_REASONS)[number]; note?: string },
) {
  await getCurrentUser();
  z.enum(STAGES).parse(stage);
  if (lost) z.enum(LOST_REASONS).parse(lost.reason);
  await changeStage(dealId, stage, lost);
  refresh();
}

// Für Formulare mit gebundenen Argumenten (FormData wird ignoriert)
export async function advanceDealAction(dealId: number, stage: "angebot" | "beauftragt" | "erledigt" | "rechnung" | "bezahlt") {
  await moveDealAction(dealId, stage);
}

export async function deleteDealAction(dealId: number) {
  await getCurrentUser();
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
});

function companyValues(form: FormData) {
  return companySchema.safeParse(
    Object.fromEntries(Object.keys(companySchema.shape).map((k) => [k, text(form, k)])),
  );
}

export async function createCompanyAction(_: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const parsed = companyValues(form);
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
  const parsed = companyValues(form);
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
  await db.insert(activities).values({ ...target, type, body });
  refresh();
  return {};
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

// Mail einer Firma zuordnen; optional Absender als Kontakt anlegen und Domain merken
export async function assignMailAction(mailId: number, _: FormState, form: FormData): Promise<FormState> {
  await getCurrentUser();
  const companyId = await resolveCompany(form);
  if (!companyId) return { error: "Bitte eine Firma auswählen oder neu eingeben." };
  const [mail] = await db.select().from(emails).where(eq(emails.id, mailId));
  if (!mail) return { error: "Mail nicht gefunden." };

  const address = mail.outgoing ? mail.toAddresses?.split(",")[0]?.trim() : mail.fromAddress;
  let contactId: number | null = null;
  if (address && form.get("createContact") === "on") {
    const [known] = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, address));
    if (known) {
      contactId = known.id;
    } else {
      const parts = (mail.outgoing ? "" : mail.fromName ?? "").trim().split(/\s+/).filter(Boolean);
      const [inserted] = await db.insert(contacts).values({
        companyId,
        firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : null,
        lastName: parts.at(-1) ?? address.split("@")[0],
        email: address,
      });
      contactId = inserted.insertId;
    }
  }
  if (form.get("learnDomain") === "on" && domainOf(address)) {
    const [company] = await db.select({ d: companies.emailDomain }).from(companies).where(eq(companies.id, companyId));
    if (!company?.d) await db.update(companies).set({ emailDomain: domainOf(address) }).where(eq(companies.id, companyId));
  }
  await db.update(emails).set({ companyId, contactId, status: "zugeordnet" }).where(eq(emails.id, mailId));
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
