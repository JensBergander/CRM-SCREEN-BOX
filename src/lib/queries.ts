import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, lt, lte, max, ne, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, deals, emails, lexwareVouchers, mailSync, tasks } from "@/db/schema";
import { addDaysIso, todayIso } from "./format";

const dealWithCompany = {
  id: deals.id,
  number: deals.number,
  title: deals.title,
  stage: deals.stage,
  amountNet: deals.amountNet,
  projectDate: deals.projectDate,
  compareOnly: deals.compareOnly,
  quick: deals.quick,
  stageChangedAt: deals.stageChangedAt,
  createdAt: deals.createdAt,
  companyId: deals.companyId,
  companyName: companies.name,
};
export type DealRow = Awaited<ReturnType<typeof listDeals>>[number];

export async function listDeals(includeLost = false) {
  return db
    .select(dealWithCompany)
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(includeLost ? undefined : ne(deals.stage, "verloren"))
    .orderBy(asc(deals.stageChangedAt));
}

const openTaskFields = {
  id: tasks.id,
  title: tasks.title,
  dueDate: tasks.dueDate,
  kind: tasks.kind,
  doneAt: tasks.doneAt,
  companyId: tasks.companyId,
  companyName: companies.name,
  dealId: tasks.dealId,
  dealTitle: deals.title,
};
export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

export async function listTasks(filter: { open?: boolean; dueUntil?: string; companyId?: number; dealId?: number } = {}) {
  return db
    .select(openTaskFields)
    .from(tasks)
    .leftJoin(companies, eq(companies.id, tasks.companyId))
    .leftJoin(deals, eq(deals.id, tasks.dealId))
    .where(
      and(
        filter.open === undefined ? undefined : filter.open ? isNull(tasks.doneAt) : isNotNull(tasks.doneAt),
        filter.dueUntil ? lte(tasks.dueDate, filter.dueUntil) : undefined,
        filter.companyId ? eq(tasks.companyId, filter.companyId) : undefined,
        filter.dealId ? eq(tasks.dealId, filter.dealId) : undefined,
      ),
    )
    .orderBy(sql`${tasks.dueDate} is null`, asc(tasks.dueDate), asc(tasks.id))
    .limit(filter.open === false ? 30 : 500);
}

export async function getDashboard() {
  const today = todayIso();
  const followUpBefore = new Date(`${addDaysIso(today, -10)}T00:00:00Z`);

  const [billing, followUps, todayTasks, [beauftragt], [offers], mails] = await Promise.all([
    db
      .select(dealWithCompany)
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(eq(deals.stage, "erledigt"))
      .orderBy(asc(deals.stageChangedAt)),
    db
      .select(dealWithCompany)
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(and(eq(deals.stage, "angebot"), lt(deals.stageChangedAt, followUpBefore)))
      .orderBy(asc(deals.stageChangedAt)),
    listTasks({ open: true, dueUntil: today }),
    db.select({ n: count() }).from(deals).where(eq(deals.stage, "beauftragt")),
    db.select({ n: count(), total: sum(deals.amountNet) }).from(deals).where(eq(deals.stage, "angebot")),
    listInbox("offen").then((rows) => rows.slice(0, 5)),
  ]);

  return { billing, followUps, todayTasks, beauftragt: beauftragt.n, offers, mails };
}

export async function getDeal(id: number) {
  const [row] = await db
    .select({ deal: deals, companyName: companies.name, contact: contacts })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .leftJoin(contacts, eq(contacts.id, deals.contactId))
    .where(eq(deals.id, id));
  if (!row) return null;
  const [dealTasks, timeline, dealEmails] = await Promise.all([
    listTasks({ dealId: id }),
    db.select().from(activities).where(eq(activities.dealId, id)).orderBy(desc(activities.createdAt)),
    emailsFor({ dealId: id }),
  ]);
  return { ...row, tasks: dealTasks, timeline, emails: dealEmails };
}

export async function companyOptions() {
  return db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name));
}

export async function listCompanies(query?: string) {
  const q = query?.trim();
  return db
    .select({
      id: companies.id,
      name: companies.name,
      city: companies.city,
      emailDomain: companies.emailDomain,
      customerNumber: companies.customerNumber,
      phone: companies.phone,
      email: companies.email,
      deals: count(deals.id),
      lastChange: max(deals.stageChangedAt),
    })
    .from(companies)
    .leftJoin(deals, eq(deals.companyId, companies.id))
    .where(
      q
        ? or(like(companies.name, `%${q}%`), like(companies.city, `%${q}%`), like(companies.emailDomain, `%${q}%`))
        : undefined,
    )
    .groupBy(companies.id)
    .orderBy(asc(companies.name));
}

export async function getCompany(id: number) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) return null;
  const [companyContacts, companyDeals, timeline, companyTasks, [lastActivity], companyEmails] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.companyId, id)).orderBy(asc(contacts.lastName)),
    db.select().from(deals).where(eq(deals.companyId, id)).orderBy(desc(deals.createdAt)),
    db.select().from(activities).where(eq(activities.companyId, id)).orderBy(desc(activities.createdAt)).limit(100),
    listTasks({ open: true, companyId: id }),
    db.select({ at: max(activities.createdAt) }).from(activities).where(eq(activities.companyId, id)),
    emailsFor({ companyId: id }),
  ]);
  const lastMail = companyEmails[0]?.receivedAt ?? null;
  const lastContact =
    lastActivity?.at && lastMail ? (lastActivity.at > lastMail ? lastActivity.at : lastMail) : lastActivity?.at ?? lastMail;

  const won = companyDeals.filter((d) => d.number !== null);
  const revenue = companyDeals
    .filter((d) => d.stage === "rechnung" || d.stage === "bezahlt")
    .reduce((s, d) => s + Number(d.amountNet ?? 0), 0);
  const compare = companyDeals.filter(
    (d) => d.compareOnly || (d.stage === "verloren" && d.lostReason === "vergleichsangebot"),
  ).length;

  return {
    company,
    contacts: companyContacts,
    deals: companyDeals,
    timeline,
    emails: companyEmails,
    tasks: companyTasks,
    stats: {
      requests: companyDeals.length,
      won: won.length,
      revenue,
      compare,
      lastContact,
    },
  };
}

export async function listContacts(query?: string) {
  const q = query?.trim();
  return db
    .select({ contact: contacts, companyName: companies.name })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(
      q
        ? or(
            like(contacts.lastName, `%${q}%`),
            like(contacts.firstName, `%${q}%`),
            like(contacts.email, `%${q}%`),
            like(companies.name, `%${q}%`),
          )
        : undefined,
    )
    .orderBy(asc(contacts.lastName))
    .limit(500);
}

export type InboxRow = Awaited<ReturnType<typeof listInbox>>[number];

export async function listInbox(view: "offen" | "alle" | "ignoriert") {
  return db
    .select({ mail: emails, companyName: companies.name })
    .from(emails)
    .leftJoin(companies, eq(companies.id, emails.companyId))
    .where(
      view === "offen"
        ? and(eq(emails.status, "neu"), eq(emails.outgoing, false))
        : view === "ignoriert"
          ? eq(emails.status, "ignoriert")
          : undefined,
    )
    .orderBy(desc(emails.receivedAt))
    .limit(200);
}

export async function getMail(id: number) {
  const [row] = await db
    .select({ mail: emails, companyName: companies.name })
    .from(emails)
    .leftJoin(companies, eq(companies.id, emails.companyId))
    .where(eq(emails.id, id));
  return row ?? null;
}

export async function mailState() {
  const [[open], syncs] = await Promise.all([
    db.select({ n: count() }).from(emails).where(and(eq(emails.status, "neu"), eq(emails.outgoing, false))),
    db.select().from(mailSync),
  ]);
  return { open: open.n, syncs };
}

export async function emailsFor(filter: { companyId?: number; dealId?: number }) {
  return db
    .select()
    .from(emails)
    .where(
      and(
        filter.companyId ? eq(emails.companyId, filter.companyId) : undefined,
        filter.dealId ? eq(emails.dealId, filter.dealId) : undefined,
        ne(emails.status, "ignoriert"),
      ),
    )
    .orderBy(desc(emails.receivedAt))
    .limit(100);
}

// Lexware-Belege der Firma eines Vorgangs: verknüpfte und noch freie (letzte 12 Monate)
export async function vouchersForDeal(deal: { offerNumber: string | null; invoiceNumber: string | null; companyId: number }) {
  const [company] = await db.select({ lexwareId: companies.lexwareId }).from(companies).where(eq(companies.id, deal.companyId));
  if (!company?.lexwareId) return { linked: [], candidates: [], hasLexware: false };
  const all = await db
    .select()
    .from(lexwareVouchers)
    .where(eq(lexwareVouchers.contactId, company.lexwareId))
    .orderBy(desc(lexwareVouchers.voucherDate));
  const used = new Set(
    (await db.select({ o: deals.offerNumber, i: deals.invoiceNumber }).from(deals)).flatMap((d) => [d.o, d.i]).filter(Boolean),
  );
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  return {
    hasLexware: true,
    linked: all.filter((v) => v.number === deal.offerNumber || v.number === deal.invoiceNumber),
    candidates: all.filter(
      (v) => !used.has(v.number) && v.voucherDate && v.voucherDate > yearAgo && !["voided", "draft"].includes(v.status),
    ),
  };
}

export async function contactsForCompanies(ids: number[]) {
  if (!ids.length) return [];
  return db
    .select({ id: contacts.id, companyId: contacts.companyId, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(inArray(contacts.companyId, ids));
}
