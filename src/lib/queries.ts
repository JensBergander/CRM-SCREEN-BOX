import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, like, lt, lte, max, ne, or, sql, sum, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, people, dealSuppliers, deals, emails, lexwareVouchers, mailSync, productionDays, tasks, voucherFiles, type CompanyKind, type Email } from "@/db/schema";
import { lexwareUrl, waitingDeals, type LineItem } from "./lexware-sync";
import { addDaysIso, todayIso } from "./format";
import { contactCols, current, fullName, selectContacts } from "./people";

const dealWithCompany = {
  id: deals.id,
  number: deals.number,
  title: deals.title,
  stage: deals.stage,
  amountNet: deals.amountNet,
  offerNumber: deals.offerNumber,
  invoiceNumber: deals.invoiceNumber,
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
    db.select({ n: count() }).from(deals).where(inArray(deals.stage, ["beauftragt", "bearbeitung"])),
    db.select({ n: count(), total: sum(deals.amountNet) }).from(deals).where(eq(deals.stage, "angebot")),
    listInbox("offen").then((rows) => rows.slice(0, 5)),
  ]);

  return { billing, followUps, todayTasks, beauftragt: beauftragt.n, offers, mails };
}

// own: Nummer der angeklickten Person (im Menü oben, abgetrennt von den übrigen der Firma)
// personId: wem die Nummer gehört (für „Mit wem?“ nach dem Anruf); fehlt bei der Zentrale
export type PhoneNumber = { label: string; number: string; own?: boolean; personId?: number };
// id = Firmenzuordnung (contacts.id), personId = die Person dahinter
type Person = { id: number; personId: number; firstName: string | null; lastName: string | null; phone: string | null; mobile: string | null; email?: string | null };
export type MailAddress = { label: string; email: string; own?: boolean };

const personName = fullName;

// Alle Nummern einer Firma zum Anrufen: bevorzugte Person zuerst, Handy vor Festnetz, Zentrale zuletzt, ohne Doppelte
function collectNumbers(staff: Person[], preferredId: number | null | undefined, companyPhone: string | null, markOwn = false): PhoneNumber[] {
  const first = staff.find((p) => p.id === preferredId) ?? staff[0];
  const ordered = first ? [first, ...staff.filter((p) => p.id !== first.id)] : staff;
  const numbers: PhoneNumber[] = [];
  const add = (label: string, number: string | null, own = false, personId?: number) => {
    const clean = number?.trim();
    if (clean && !numbers.some((n) => n.number.replace(/\D/g, "") === clean.replace(/\D/g, ""))) {
      numbers.push({ label, number: clean, ...(own && { own }), ...(personId && { personId }) });
    }
  };
  for (const p of ordered) {
    const who = personName(p);
    const own = markOwn && p.id === preferredId;
    add(`${who} · Handy`, p.mobile, own, p.personId);
    add(`${who} · Festnetz`, p.phone, own, p.personId);
  }
  add("Zentrale", companyPhone);
  return numbers;
}

// Alle Mail-Adressen einer Firma, gleiche Reihenfolge wie bei den Nummern, allgemeine Firmenadresse zuletzt
function collectEmails(staff: Person[], preferredId: number | null | undefined, companyEmail: string | null, markOwn = false): MailAddress[] {
  const first = staff.find((p) => p.id === preferredId) ?? staff[0];
  const ordered = first ? [first, ...staff.filter((p) => p.id !== first.id)] : staff;
  const list: MailAddress[] = [];
  const add = (label: string, email: string | null | undefined, own = false) => {
    const clean = email?.trim();
    if (clean && !list.some((m) => m.email.toLowerCase() === clean.toLowerCase())) list.push({ label, email: clean, ...(own && { own }) });
  };
  for (const p of ordered) add(personName(p), p.email, markOwn && p.id === preferredId);
  add("Firma allgemein", companyEmail);
  return list;
}

// Alles, was 📞 und das Popup „Anruf festhalten“ brauchen
export type CallTarget = {
  companyId: number | null;
  title: string;
  person?: string;
  numbers: PhoneNumber[];
  emails?: MailAddress[];
  projects: { id: number; title: string }[];
};
type CallContext = { id: number; name: string; phone: string | null; email: string | null; staff: Person[]; preferredId: number | null; projects: { id: number; title: string }[] };

// Für Listen: Ansprechpartner, Zentrale und laufende Vorgänge vieler Firmen in drei Abfragen
export async function callContexts(companyIds: number[]): Promise<Map<number, CallContext>> {
  const ids = [...new Set(companyIds)];
  if (!ids.length) return new Map();
  const [firms, staff, running] = await Promise.all([
    db.select({ id: companies.id, name: companies.name, phone: companies.phone, email: companies.email }).from(companies).where(inArray(companies.id, ids)),
    selectContacts().where(and(inArray(contacts.companyId, ids), current)).orderBy(asc(contacts.id)),
    db
      .select({ id: deals.id, title: deals.title, companyId: deals.companyId, contactId: deals.contactId })
      .from(deals)
      .where(and(inArray(deals.companyId, ids), inArray(deals.stage, [...ACTIVE_STAGES])))
      .orderBy(desc(deals.stageChangedAt)),
  ]);
  return new Map(
    firms.map((f) => {
      const own = running.filter((d) => d.companyId === f.id);
      return [
        f.id,
        {
          id: f.id,
          name: f.name.trim(),
          phone: f.phone,
          email: f.email,
          staff: staff.filter((p) => p.companyId === f.id),
          preferredId: own.find((d) => d.contactId)?.contactId ?? null,
          projects: own.map((d) => ({ id: d.id, title: d.title })),
        },
      ];
    }),
  );
}

export function companyCall(ctx: CallContext): CallTarget {
  return {
    companyId: ctx.id,
    title: ctx.name,
    numbers: collectNumbers(ctx.staff, ctx.preferredId, ctx.phone),
    emails: collectEmails(ctx.staff, ctx.preferredId, ctx.email),
    projects: ctx.projects,
  };
}

// Person: ihre Nummern oben, darunter die übrigen ihrer Firma
export function personCall(ctx: CallContext | undefined, person: Person): CallTarget {
  const name = personName(person);
  const staff = ctx ? [person, ...ctx.staff.filter((p) => p.id !== person.id)] : [person];
  return {
    companyId: ctx?.id ?? null,
    title: ctx ? `${ctx.name} · ${name}` : name,
    person: name,
    numbers: collectNumbers(staff, person.id, ctx?.phone ?? null, true),
    emails: collectEmails(staff, person.id, ctx?.email ?? null, true),
    projects: ctx?.projects ?? [],
  };
}

// Nummern für „Anruf“ im Vorgang (dessen Ansprechpartner zuerst) bzw. in der Firma (Ansprechpartner des zuletzt bewegten laufenden Vorgangs)
export async function phoneNumbers(companyId: number, dealId?: number | null): Promise<PhoneNumber[]> {
  const [[company], staff] = await Promise.all([
    db.select({ phone: companies.phone }).from(companies).where(eq(companies.id, companyId)),
    selectContacts().where(and(eq(contacts.companyId, companyId), current)).orderBy(asc(contacts.id)),
  ]);
  const [deal] = await db
    .select({ contactId: deals.contactId })
    .from(deals)
    .where(dealId ? eq(deals.id, dealId) : and(eq(deals.companyId, companyId), inArray(deals.stage, [...ACTIVE_STAGES]), isNotNull(deals.contactId)))
    .orderBy(desc(deals.stageChangedAt))
    .limit(1);
  return collectNumbers(staff, deal?.contactId, company?.phone ?? null);
}

// Startseite „Zuletzt aktiv“: Firmen mit Notiz/Anruf in den letzten 30 Tagen und alle mit laufendem Vorgang,
// sortiert nach der letzten Notiz, dem letzten Anruf oder der letzten Mail (beide Richtungen)
export type RecentCompany = {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  // alle Nummern der Firma, Ansprechpartner aus dem Vorgang zuerst, Handy vor Festnetz, Zentrale zuletzt
  numbers: PhoneNumber[];
  last: Date | null;
  projects: { id: number; title: string }[];
};

export async function recentCompanies(): Promise<RecentCompany[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [running, noted] = await Promise.all([
    db
      .select({ id: deals.id, title: deals.title, companyId: deals.companyId, contactId: deals.contactId })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(and(inArray(deals.stage, [...ACTIVE_STAGES]), ne(companies.kind, "wettbewerber")))
      .orderBy(desc(deals.stageChangedAt)),
    db
      .selectDistinct({ companyId: activities.companyId })
      .from(activities)
      .where(and(inArray(activities.type, ["notiz", "anruf"]), sql`${activities.createdAt} >= ${since}`, isNotNull(activities.companyId))),
  ]);
  const ids = [...new Set([...running.map((d) => d.companyId), ...noted.map((n) => n.companyId!)])];
  if (!ids.length) return [];

  const [firms, people, acts, mails] = await Promise.all([
    db.select({ id: companies.id, name: companies.name, phone: companies.phone, kind: companies.kind }).from(companies).where(inArray(companies.id, ids)),
    selectContacts().where(and(inArray(contacts.companyId, ids), current)).orderBy(asc(contacts.id)),
    db
      .select({ companyId: activities.companyId, last: max(activities.createdAt) })
      .from(activities)
      .where(and(inArray(activities.companyId, ids), inArray(activities.type, ["notiz", "anruf"])))
      .groupBy(activities.companyId),
    db.select({ companyId: emails.companyId, last: max(emails.receivedAt) }).from(emails).where(inArray(emails.companyId, ids)).groupBy(emails.companyId),
  ]);

  const lastOf = new Map<number, Date>();
  for (const r of [...acts, ...mails]) {
    if (!r.companyId || !r.last) continue;
    const at = new Date(r.last);
    if (!lastOf.has(r.companyId) || at > lastOf.get(r.companyId)!) lastOf.set(r.companyId, at);
  }
  return firms
    .filter((f) => f.kind !== "wettbewerber")
    .map((f) => {
      const own = running.filter((d) => d.companyId === f.id);
      const staff = people.filter((p) => p.companyId === f.id);
      // Ansprechpartner aus dem Vorgang, sonst der erste der Firma
      const person = staff.find((p) => own.some((d) => d.contactId === p.id)) ?? staff[0] ?? null;
      const numbers = collectNumbers(staff, person?.id, f.phone);
      return {
        id: f.id,
        name: f.name.trim(),
        contact: person ? personName(person) : null,
        phone: numbers[0]?.number ?? null,
        numbers,
        last: lastOf.get(f.id) ?? null,
        projects: own.map((d) => ({ id: d.id, title: d.title })),
      };
    })
    .sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0) || a.name.localeCompare(b.name, "de"));
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
    .select({ deal: deals, companyName: companies.name, folderName: companies.folderName, contact: contactCols, lexware: lexwareFields })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .leftJoin(contacts, eq(contacts.id, deals.contactId))
    .leftJoin(people, eq(people.id, contacts.personId))
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

export const ACTIVE_STAGES = ["anfrage", "angebot", "beauftragt", "bearbeitung", "erledigt", "rechnung"] as const;

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

// Suche nach Wörtern: jedes Wort muss in irgendeinem der Felder vorkommen („Max Mustermann“, „Mustermann Eurowings“)
function wordSearch(query: string | undefined, fields: (word: string) => SQL[]): SQL | undefined {
  const words = (query ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return undefined;
  return and(...words.map((w) => or(...fields(`%${w}%`))));
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
        // auch über die Namen der Ansprechpartner
        wordSearch(q, (w) => [
          like(companies.name, w),
          like(companies.city, w),
          like(companies.emailDomain, w),
          like(companies.tags, w),
          like(companies.notes, w),
          sql`exists (select 1 from ${contacts} join ${people} on ${people.id} = ${contacts.personId} where ${contacts.companyId} = ${companies.id} and (${people.firstName} like ${w} or ${people.lastName} like ${w}))`,
        ]),
      ),
    )
    .groupBy(companies.id)
    // in Lexware archivierte Firmen ans Ende
    .orderBy(asc(companies.lexwareArchived), asc(companies.name));
}

// Alle vergebenen Kategorien mit Anzahl, für die Filter auf der Lieferanten-Seite
export async function serviceTags() {
  const rows = await db.select({ tags: companies.tags }).from(companies).where(eq(companies.kind, "lieferant"));
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of (r.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, n]) => ({ tag, n }));
}

// Erste Kontaktperson je Firma (Name, Telefon, Mail) für die Lieferanten-Liste
export async function primaryContacts(companyIds: number[]) {
  if (!companyIds.length) return new Map<number, { name: string; phone: string | null; email: string | null }>();
  const rows = await selectContacts().where(and(inArray(contacts.companyId, companyIds), current)).orderBy(asc(contacts.id));
  const map = new Map<number, { name: string; phone: string | null; email: string | null }>();
  for (const c of rows) {
    if (c.companyId && !map.has(c.companyId)) {
      map.set(c.companyId, { name: personName(c), phone: c.phone, email: c.email });
    }
  }
  return map;
}

export async function getCompany(id: number) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) return null;
  const [companyContacts, companyDeals, timeline, companyTasks, [lastActivity], companyEmails] = await Promise.all([
    // aktuelle zuerst, „früher“ am Ende; innerhalb nach Nachname bzw. Vorname
    selectContacts()
      .where(eq(contacts.companyId, id))
      .orderBy(sql`${contacts.endedAt} is not null`, sql`coalesce(${people.lastName}, ${people.firstName})`),
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

// Kontaktliste: eine Zeile je Person, mit allen Firmenzuordnungen (aktuelle zuerst).
// Jedes Suchwort muss im Namen der Person oder in einer ihrer Zuordnungen (Mail, Position, Firma) vorkommen.
export async function listContacts(query?: string) {
  const hit = (w: string) =>
    sql`(${people.firstName} like ${w} or ${people.lastName} like ${w} or exists (
      select 1 from ${contacts} c2 left join ${companies} co2 on co2.id = c2.company_id
      where c2.person_id = ${people.id} and (c2.email like ${w} or c2.position like ${w} or co2.name like ${w})))`;
  const words = (query ?? "").trim().split(/\s+/).filter(Boolean);
  const persons = await db
    .select()
    .from(people)
    .where(words.length ? and(...words.map((w) => hit(`%${w}%`))) : undefined)
    .orderBy(sql`coalesce(${people.lastName}, ${people.firstName})`, asc(people.firstName))
    .limit(500);
  if (!persons.length) return [];
  const links = await db
    .select({ contact: contacts, companyName: companies.name, lexware: lexwareFields })
    .from(contacts)
    .leftJoin(companies, eq(companies.id, contacts.companyId))
    .where(inArray(contacts.personId, persons.map((p) => p.id)))
    .orderBy(sql`${contacts.endedAt} is not null`, asc(contacts.id));
  return persons.map((person) => ({ person, links: links.filter((l) => l.contact.personId === person.id) }));
}

export type InboxRow = Awaited<ReturnType<typeof listInbox>>[number];

export async function listInbox(view: "offen" | "alle" | "ignoriert", query?: string) {
  const q = query?.trim();
  return db
    .select({
      mail: emails,
      companyName: companies.name,
      dealTitle: deals.title,
      dealActive: sql<boolean>`${deals.stage} in ('anfrage','angebot','beauftragt','bearbeitung','erledigt','rechnung')`,
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
        wordSearch(q, (w) => [
          like(emails.subject, w),
          like(emails.fromAddress, w),
          like(emails.fromName, w),
          like(emails.toAddresses, w),
          like(emails.preview, w),
          like(companies.name, w),
        ]),
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
// Rückfragen: neue Lexware-Belege, zu denen ein laufender Vorgang der Firma passen könnte
export async function pendingVouchers() {
  const rows = await db
    .select({ voucher: lexwareVouchers, companyId: companies.id, companyName: companies.name })
    .from(lexwareVouchers)
    .innerJoin(companies, eq(companies.lexwareId, lexwareVouchers.contactId))
    .where(eq(lexwareVouchers.pending, true))
    .orderBy(desc(lexwareVouchers.voucherDate));
  // Belege, deren Nummer schon an einem Vorgang steht, sind zugeordnet, auch wenn die Rückfrage noch offen markiert ist
  const used = new Set(
    (await db.select({ o: deals.offerNumber, i: deals.invoiceNumber }).from(deals)).flatMap((d) => [d.o, d.i]).filter(Boolean),
  );
  return Promise.all(
    rows.filter((r) => !used.has(r.voucher.number)).map(async (r) => ({ ...r, deals: (await waitingDeals(r.companyId, r.voucher.type)).map((d) => ({ id: d.id, title: d.title, stage: d.stage })) })),
  );
}

export async function vouchersForDeal(deal: { offerNumber: string | null; invoiceNumber: string | null; companyId: number; stage: string }) {
  const [company] = await db.select({ lexwareId: companies.lexwareId }).from(companies).where(eq(companies.id, deal.companyId));
  if (!company?.lexwareId) return { linked: [], candidates: [], questions: [], archived: [], hasLexware: false };
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
  const free = all.filter((v) => !used.has(v.number) && !["voided", "draft"].includes(v.status));
  // Rückfragen: neue Belege, die zu diesem Vorgang gehören könnten
  const waitsFor = (v: (typeof all)[number]) =>
    v.type === "invoice"
      ? !deal.invoiceNumber && ["beauftragt", "bearbeitung", "erledigt"].includes(deal.stage)
      : !deal.offerNumber && ["anfrage", "angebot"].includes(deal.stage);
  const twoMonthsAgo = new Date(Date.now() - 61 * 86_400_000);
  return {
    hasLexware: true,
    linked: all.filter((v) => v.number === deal.offerNumber || v.number === deal.invoiceNumber).map(enrich),
    questions: free.filter((v) => v.pending && waitsFor(v)).map(enrich),
    candidates: free.filter((v) => !v.archived && !v.pending && v.voucherDate && v.voucherDate > yearAgo).map(enrich),
    // ausgeblendete Belege der letzten zwei Monate, z. B. um nachzusehen, ob eine Rechnung schon raus ist
    archived: free.filter((v) => v.archived && v.voucherDate && v.voucherDate > twoMonthsAgo).map(enrich),
  };
}

export async function contactsForCompanies(ids: number[]) {
  if (!ids.length) return [];
  return db
    .select({ id: contacts.id, personId: contacts.personId, companyId: contacts.companyId, firstName: people.firstName, lastName: people.lastName })
    .from(contacts)
    .innerJoin(people, eq(people.id, contacts.personId))
    .where(and(inArray(contacts.companyId, ids), current));
}
