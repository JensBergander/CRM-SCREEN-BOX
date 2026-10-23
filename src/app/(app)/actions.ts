"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { activities, companies, contacts, deals, LOST_REASONS, STAGES, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { suggestFolderName } from "@/lib/format";
import { importLexwareCustomers, domainOf, type ImportResult } from "@/lib/lexware";
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
  const id = await createDeal({
    ...parsed.data,
    companyId,
    contactId: Number(text(form, "contactId")) || null,
    compareOnly: form.get("compareOnly") === "on",
    quick,
  });
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
