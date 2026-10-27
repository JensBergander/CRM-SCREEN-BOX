import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, lt, lte, max, ne, or, sql, sum } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, dealSuppliers, deals, emails, lexwareVouchers, mailSync, productionDays, tasks, voucherFiles, type CompanyKind, type Email } from "@/db/schema";
import { lexwareUrl, type LineItem } from "./lexware-sync";
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

// Felder für das Lexware-Badge
const lexwareFields = {
  lexwareId: companies.lexwareId,
  customerNumber: companies.customerNumber,
  supplierNumber: companies.supplierNumber,
  lexwareArchived: companies.lexwareArchived,
};

export async function getDeal(id: number) {
  const [row] = await db
    .select({ deal: deals, companyName: companies.name, folderName: companies.folderName, contact: contacts, lexware: lexwareFields })
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
  return {
    ...row,
    tasks: dealTasks,
    timeline,
    emails: dealEmails,
    senders: await foreignSenders(dealEmails, row.deal.companyId),
    projects: await projectsFor(row.deal.companyId),
  };
}

export const ACTIVE_STAGES = ["anfrage", "angebot", "beauftragt", "erledigt", "rechnung"] as const;

// company: Kunde des Projekts, wenn die Liste Projekte mehrerer Kunden enthält (bei Lieferanten)
export type ProjectOption = { id: number; title: string; number: string | null; active: boolean; company?: string };

// Alle Vorgänge einer Firma als Projekte; aktive zuerst, zuletzt bewegte vorn.
// Lieferanten haben keine eigenen Vorgänge: für sie die laufenden Projekte aller Kunden
export async function projectsFor(companyId: number): Promise<ProjectOption[]> {
  const [company] = await db.select({ kind: companies.kind }).from(companies).where(eq(companies.id, companyId));
  if (company?.kind === "lieferant") return supplierProjectOptions(companyId);
  const rows = await db
    .select({ id: deals.id, title: deals.title, number: deals.number, stage: deals.stage, moved: deals.stageChangedAt })
    .from(deals)
    .where(eq(deals.companyId, companyId))
    .orderBy(desc(deals.stageChangedAt));
  const list = rows.map((r) => ({ id: r.id, title: r.title, number: r.number, active: (ACTIVE_STAGES as readonly string[]).includes(r.stage) }));
  return [...list.filter((p) => p.active), ...list.filter((p) => !p.active)];
}

// Laufende Projekte aller Kunden; die mit der nächsten Produktion zuerst, dann zuletzt bewegte
export async function runningProjects(): Promise<ProjectOption[]> {
  const today = todayIso();
  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      number: deals.number,
      company: companies.name,
      moved: deals.stageChangedAt,
      next: sql<string | null>`(select min(${productionDays.day}) from ${productionDays} where ${productionDays.dealId} = ${deals.id} and ${productionDays.day} >= ${today})`,
    })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(inArray(deals.stage, [...ACTIVE_STAGES]));
  return rows
    .sort((a, b) => (a.next && b.next ? a.next.localeCompare(b.next) : a.next ? -1 : b.next ? 1 : b.moved.getTime() - a.moved.getTime()))
    .map((r) => ({ id: r.id, title: r.title, number: r.number, active: true, company: r.company }));
}

// Für Lieferanten: laufende Projekte plus abgeschlossene, mit denen sie schon verknüpft sind
async function supplierProjectOptions(companyId: number): Promise<ProjectOption[]> {
  const running = await runningProjects();
  const linked = await db
    .select({ id: deals.id, title: deals.title, number: deals.number, company: companies.name })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(
      or(
        inArray(deals.id, db.select({ id: dealSuppliers.dealId }).from(dealSuppliers).where(eq(dealSuppliers.companyId, companyId))),
        inArray(deals.id, db.select({ id: emails.dealId }).from(emails).where(and(eq(emails.companyId, companyId), isNotNull(emails.dealId)))),
      ),
    );
  const ids = new Set(running.map((p) => p.id));
  return [...running, ...linked.filter((d) => !ids.has(d.id)).map((d) => ({ ...d, active: false }))];
}

// Namen der Absender-Firmen von Mails, die nicht von der eigenen Firma stammen (Lieferanten-Mails im Projekt)
export async function foreignSenders(list: Email[], ownCompanyId: number): Promise<Record<number, string>> {
  const ids = [...new Set(list.map((m) => m.companyId).filter((id): id is number => !!id && id !== ownCompanyId))];
  if (!ids.length) return {};
  const rows = await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

export type SupplierRow = Awaited<ReturnType<typeof suppliersForDeal>>[number];

// Lieferanten eines Vorgangs mit Notiz und Kosten
export async function suppliersForDeal(dealId: number) {
  return db
    .select({ id: dealSuppliers.id, companyId: dealSuppliers.companyId, name: companies.name, tags: companies.tags, note: dealSuppliers.note, costNet: dealSuppliers.costNet })
    .from(dealSuppliers)
    .innerJoin(companies, eq(companies.id, dealSuppliers.companyId))
    .where(eq(dealSuppliers.dealId, dealId))
    .orderBy(asc(dealSuppliers.createdAt));
}

// Projekte, für die ein Lieferant eingetragen ist, neueste zuerst
export async function projectsOfSupplier(companyId: number) {
  return db
    .select({ dealId: deals.id, title: deals.title, number: deals.number, stage: deals.stage, customer: companies.name, note: dealSuppliers.note, costNet: dealSuppliers.costNet })
    .from(dealSuppliers)
    .innerJoin(deals, eq(deals.id, dealSuppliers.dealId))
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(dealSuppliers.companyId, companyId))
    .orderBy(desc(deals.createdAt));
}

export async function supplierNames(): Promise<string[]> {
  const rows = await db.select({ name: companies.name }).from(companies).where(eq(companies.kind, "lieferant")).orderBy(asc(companies.name));
  return rows.map((r) => r.name);
}

export async function getActivity(id: number) {
  const [row] = await db.select().from(activities).where(eq(activities.id, id));
  return row ?? null;
}

// Verlorene Vorgänge, die ein Wettbewerber gewonnen hat
export async function dealsWonBy(competitorId: number) {
  return db
    .select({ id: deals.id, title: deals.title, amountNet: deals.amountNet, lostReason: deals.lostReason, companyName: companies.name, companyId: deals.companyId })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(eq(deals.competitorId, competitorId))
    .orderBy(desc(deals.stageChangedAt));
}

export async function companyName(id: number): Promise<string | null> {
  const [row] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, id));
  return row?.name ?? null;
}

export async function competitorNames(): Promise<string[]> {
  const rows = await db.select({ name: companies.name }).from(companies).where(eq(companies.kind, "wettbewerber")).orderBy(asc(companies.name));
  return rows.map((r) => r.name);
}

// forDeals: ohne Lieferanten, die haben keine eigenen Vorgänge
export async function companyOptions(forDeals = false) {
  return db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(forDeals ? ne(companies.kind, "lieferant") : undefined)
    .orderBy(asc(companies.name));
}

export async function listCompanies(query?: string, kind: CompanyKind | "alle" = "kunde", tag?: string) {
  const q = query?.trim();
  return db
    .select({
      id: companies.id,
      name: companies.name,
      kind: companies.kind,
      tags: companies.tags,
      notes: companies.notes,
      city: companies.city,
      emailDomain: companies.emailDomain,
      customerNumber: companies.customerNumber,
      supplierNumber: companies.supplierNumber,
      lexwareId: companies.lexwareId,
      lexwareArchived: companies.lexwareArchived,
      phone: companies.phone,
      email: companies.email,
      deals: count(deals.id),
      lastChange: max(deals.stageChangedAt),
    })
    .from(companies)
    .leftJoin(deals, eq(deals.companyId, companies.id))
    .where(
      and(
        kind === "alle" ? undefined : eq(companies.kind, kind),
        // exakter Treffer in der kommagetrennten Liste
        tag ? sql`find_in_set(${tag}, replace(${companies.tags}, ', ', ',')) > 0` : undefined,
        q
          ? or(
              like(companies.name, `%${q}%`),
              like(companies.city, `%${q}%`),
              like(companies.emailDomain, `%${q}%`),
              like(companies.tags, `%${q}%`),
              like(companies.notes, `%${q}%`),
            )
          : undefined,
      ),
    )
    .groupBy(companies.id)
    // in Lexware archivierte Firmen ans Ende
    .orderBy(asc(companies.lexwareArchived), asc(companies.name));
}

// Alle vergebenen Gewerke bzw. Kategorien mit Anzahl, für die Filter auf der Dienstleister- und Lieferanten-Seite
export async function serviceTags(kind: "dienstleister" | "lieferant" = "dienstleister") {
  const rows = await db.select({ tags: companies.tags }).from(companies).where(eq(companies.kind, kind));
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of (r.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, n]) => ({ tag, n }));
}

// Erste Kontaktperson je Firma (Name, Telefon, Mail) für die Dienstleister-Liste
export async function primaryContacts(companyIds: number[]) {
  if (!companyIds.length) return new Map<number, { name: string; phone: string | null; email: string | null }>();
  const rows = await db.select().from(contacts).where(inArray(contacts.companyId, companyIds)).orderBy(asc(contacts.id));
  const map = new Map<number, { name: string; phone: string | null; email: string | null }>();
  for (const c of rows) {
    if (c.companyId && !map.has(c.companyId)) {
      map.set(c.companyId, { name: [c.firstName, c.lastName].filter(Boolean).join(" "), phone: c.phone, email: c.email });
    }
  }
  return map;
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
    emailsFor({ companyId: id, withDeals: true }),
  ]);
  // nur eigene Mails, nicht die von Lieferanten zu ihren Projekten
  const lastMail = companyEmails.find((m) => m.companyId === id)?.receivedAt ?? null;
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
    senders: await foreignSenders(companyEmails, id),
    tasks: companyTasks,
    projects: await projectsFor(id),
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
    .select({ contact: contacts, companyName: companies.name, lexware: lexwareFields })
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

export async function listInbox(view: "offen" | "alle" | "ignoriert", query?: string) {
  const q = query?.trim();
  return db
    .select({
      mail: emails,
      companyName: companies.name,
      dealTitle: deals.title,
      dealActive: sql<boolean>`${deals.stage} in ('anfrage','angebot','beauftragt','erledigt','rechnung')`,
    })
    .from(emails)
    .leftJoin(companies, eq(companies.id, emails.companyId))
    .leftJoin(deals, eq(deals.id, emails.dealId))
    .where(
      and(
        view === "offen"
          ? and(eq(emails.status, "neu"), eq(emails.outgoing, false))
          : view === "ignoriert"
            ? eq(emails.status, "ignoriert")
            : undefined,
        q
          ? or(
              like(emails.subject, `%${q}%`),
              like(emails.fromAddress, `%${q}%`),
              like(emails.fromName, `%${q}%`),
              like(emails.toAddresses, `%${q}%`),
              like(emails.preview, `%${q}%`),
              like(companies.name, `%${q}%`),
            )
          : undefined,
      ),
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

// withDeals: bei einer Firma auch fremde Mails (Lieferanten), die ihren Projekten zugeordnet sind
export async function emailsFor(filter: { companyId?: number; dealId?: number; withDeals?: boolean }) {
  return db
    .select()
    .from(emails)
    .where(
      and(
        filter.companyId
          ? filter.withDeals
            ? or(
                eq(emails.companyId, filter.companyId),
                inArray(emails.dealId, db.select({ id: deals.id }).from(deals).where(eq(deals.companyId, filter.companyId))),
              )
            : eq(emails.companyId, filter.companyId)
          : undefined,
        filter.dealId ? eq(emails.dealId, filter.dealId) : undefined,
        ne(emails.status, "ignoriert"),
      ),
    )
    .orderBy(desc(emails.receivedAt))
    .limit(300);
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
  const withPdf = new Set(
    (await db.select({ id: voucherFiles.voucherId }).from(voucherFiles).where(inArray(voucherFiles.voucherId, all.map((v) => v.id).concat("")))).map((f) => f.id),
  );
  const linkedOffer = all.find((v) => v.number === deal.offerNumber);
  const enrich = (v: (typeof all)[number]) => ({
    ...v,
    url: lexwareUrl(v),
    pdfUrl: withPdf.has(v.id) ? `/api/belege/${v.id}` : null,
    items: v.lineItems ? (JSON.parse(v.lineItems) as LineItem[]) : [],
    // jüngeres Angebot als das verknüpfte, z. B. eine überarbeitete Fassung mit neuer Nummer
    newer:
      v.type === "quotation" &&
      !!linkedOffer?.voucherDate &&
      !!v.voucherDate &&
      v.number !== linkedOffer.number &&
      v.voucherDate.getTime() >= linkedOffer.voucherDate.getTime(),
  });
  return {
    hasLexware: true,
    linked: all.filter((v) => v.number === deal.offerNumber || v.number === deal.invoiceNumber).map(enrich),
    candidates: all
      .filter((v) => !used.has(v.number) && v.voucherDate && v.voucherDate > yearAgo && !["voided", "draft"].includes(v.status))
      .map(enrich),
  };
}

export async function contactsForCompanies(ids: number[]) {
  if (!ids.length) return [];
  return db
    .select({ id: contacts.id, companyId: contacts.companyId, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(inArray(contacts.companyId, ids));
}
