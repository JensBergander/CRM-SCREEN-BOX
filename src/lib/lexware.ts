import "server-only";
import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { appState, companies, contacts, type Company, type CompanyKind } from "@/db/schema";
import { suggestFolderName, todayIso } from "./format";

const API = "https://api.lexware.io/v1";

export type LexwareContact = {
  id: string;
  version?: number;
  archived: boolean;
  roles: { customer?: { number: number }; vendor?: { number: number } };
  company?: {
    name: string;
    contactPersons?: {
      firstName?: string;
      lastName: string;
      emailAddress?: string;
      phoneNumber?: string;
      primary?: boolean;
    }[];
  };
  person?: { salutation?: string; firstName?: string; lastName: string };
  addresses?: { billing?: { street?: string; zip?: string; city?: string }[] };
  emailAddresses?: Record<string, string[]>;
  phoneNumbers?: Record<string, string[]>;
  note?: string;
};

// Domains, die nichts über die Firma aussagen
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "gmx.de", "gmx.net", "web.de", "t-online.de",
  "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "yahoo.com", "yahoo.de",
  "icloud.com", "me.com", "live.de", "live.com", "freenet.de", "posteo.de", "aol.com",
]);

export function domainOf(email: string | null | undefined): string | null {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  return domain && !FREEMAIL.has(domain) ? domain : null;
}


// Link auf den Kontakt in der Lexware-Oberfläche
export const lexwareContactUrl = (id: string) => `https://app.lexware.de/permalink/contacts/view/${id}`;

async function lexware<T>(path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.LEXWARE_API_KEY}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
    // Lexware erlaubt 2 Anfragen pro Sekunde; bei Überschreitung kurz warten
    if (response.status === 429 && attempt < 3) {
      await pause(1100);
      continue;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Lexware antwortet mit ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
    }
    return response.json() as Promise<T>;
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Page = { content: LexwareContact[]; last: boolean };

async function fetchAllContacts(): Promise<LexwareContact[]> {
  const all: LexwareContact[] = [];
  for (let page = 0; ; page++) {
    const data = await lexware<Page>(`/contacts?page=${page}&size=100`);
    all.push(...data.content.filter((c) => c.roles.customer || c.roles.vendor));
    if (data.last) return all;
    await pause(600);
  }
}

const nameOf = (lx: LexwareContact) =>
  lx.company?.name ?? [lx.person?.firstName, lx.person?.lastName].filter(Boolean).join(" ");
const emailsOf = (lx: LexwareContact) => Object.values(lx.emailAddresses ?? {}).flat().filter(Boolean);
const phonesOf = (lx: LexwareContact) => Object.values(lx.phoneNumbers ?? {}).flat().filter(Boolean);

// Ansprechpartner einer Lexware-Firma bzw. die Person selbst
function peopleOf(lx: LexwareContact) {
  if (lx.person) {
    return [{ firstName: lx.person.firstName ?? null, lastName: lx.person.lastName, email: emailsOf(lx)[0] ?? null, phone: phonesOf(lx)[0] ?? null }];
  }
  return (lx.company?.contactPersons ?? [])
    .filter((p) => p.lastName)
    .map((p) => ({ firstName: p.firstName ?? null, lastName: p.lastName, email: p.emailAddress ?? null, phone: p.phoneNumber ?? null }));
}

const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// Stammdaten aus Lexware übernehmen: Lexware gewinnt. Mail und Telefon behält das CRM nur, wenn Lexware keine hat.
// CRM-eigene Felder (Notizen, Ordner, Bewertung, Kategorien, Mail-Domain, Firmenart) bleiben unberührt.
async function applyContact(lx: LexwareContact, company: Company) {
  const emails = emailsOf(lx);
  const phones = phonesOf(lx);
  const address = lx.addresses?.billing?.[0];
  const people = peopleOf(lx);
  await db
    .update(companies)
    .set({
      name: nameOf(lx) || company.name,
      lexwareId: lx.id,
      lexwareArchived: lx.archived,
      customerNumber: lx.roles.customer ? String(lx.roles.customer.number) : null,
      supplierNumber: lx.roles.vendor ? String(lx.roles.vendor.number) : null,
      street: address?.street ?? null,
      zip: address?.zip ?? null,
      city: address?.city ?? null,
      phone: phones[0] ?? company.phone,
      email: emails[0] ?? company.email,
      // Lieferant, der inzwischen auch Kunde ist, wird Kunde; andere Arten bleiben, wie sie im CRM gesetzt sind
      kind: company.kind === "lieferant" && lx.roles.customer ? "kunde" : company.kind,
      emailDomain: company.emailDomain ?? [...emails, ...people.map((p) => p.email)].map(domainOf).find(Boolean) ?? null,
    })
    .where(eq(companies.id, company.id));

  // Ansprechpartner: vorhandene wiederfinden (erst Lexware-markierte, dann Mail, dann Name), sonst neu anlegen
  const known = await db.select().from(contacts).where(eq(contacts.companyId, company.id));
  const matched = new Set<number>();
  let created = 0;
  for (const p of people) {
    const free = known.filter((c) => !matched.has(c.id));
    const sameName = (c: (typeof known)[number]) =>
      same(c.lastName, p.lastName) && (!c.firstName || !p.firstName || same(c.firstName, p.firstName));
    const hit =
      free.find((c) => c.fromLexware && sameName(c)) ??
      free.find((c) => same(c.email, p.email)) ??
      free.find(sameName);
    if (hit) {
      matched.add(hit.id);
      await db
        .update(contacts)
        .set({
          firstName: p.firstName ?? hit.firstName,
          lastName: p.lastName,
          email: p.email ?? hit.email,
          phone: p.phone ?? hit.phone,
          fromLexware: true,
        })
        .where(eq(contacts.id, hit.id));
    } else {
      await db.insert(contacts).values({ companyId: company.id, ...p, fromLexware: true });
      created++;
    }
  }
  // In Lexware entfernte Ansprechpartner werden normale CRM-Kontakte
  const gone = known.filter((c) => c.fromLexware && !matched.has(c.id)).map((c) => c.id);
  if (gone.length) await db.update(contacts).set({ fromLexware: false }).where(inArray(contacts.id, gone));
  return created;
}

async function createCompanyFrom(lx: LexwareContact) {
  const name = nameOf(lx);
  const kind: CompanyKind = lx.roles.customer ? "kunde" : "lieferant";
  const [inserted] = await db.insert(companies).values({
    name,
    kind,
    lexwareId: lx.id,
    folderName: kind === "kunde" ? suggestFolderName(name) : null,
    notes: lx.note ?? null,
  });
  const [company] = await db.select().from(companies).where(eq(companies.id, inserted.insertId));
  return company;
}

// Firmenname ohne Rechtsform und Satzzeichen, für den Vergleich ähnlicher Namen
function normalize(name: string) {
  return suggestFolderName(name).toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
}

function similar(a: string, b: string) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 5 && long.startsWith(short);
}

// Mögliche Dubletten: Lexware-Kontakt, der einer CRM-Firma ohne Lexware ähnelt; wird erst angelegt, wenn du entscheidest
export type Duplicate = { lexwareId: string; lexwareName: string; number: string | null; companyId: number; companyName: string };
const DUPES_KEY = "lexware_duplicates";
const DISMISSED_KEY = "lexware_duplicates_dismissed";
const SYNCED_KEY = "lexware_contacts_synced";

async function readState<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appState).where(eq(appState.key, key));
  return row?.value ? (JSON.parse(row.value) as T) : fallback;
}

async function writeState(key: string, value: unknown) {
  const json = JSON.stringify(value);
  await db.insert(appState).values({ key, value: json }).onDuplicateKeyUpdate({ set: { value: json } });
}

export const duplicates = () => readState<Duplicate[]>(DUPES_KEY, []);
export const lastContactSync = () => readState<string | null>(SYNCED_KEY, null);

// Eindeutige Treffer für eine neue Lexware-Firma unter den CRM-Firmen ohne Lexware: gleiche Mail oder Firmen-Domain
async function exactMatch(lx: LexwareContact, unlinked: Company[]) {
  const mails = [...emailsOf(lx), ...peopleOf(lx).map((p) => p.email)].filter((m): m is string => !!m).map((m) => m.toLowerCase());
  if (!mails.length) return null;
  const byCompanyMail = unlinked.find((c) => c.email && mails.includes(c.email.toLowerCase()));
  if (byCompanyMail) return byCompanyMail;
  const [byContact] = await db
    .select({ companyId: contacts.companyId })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .where(and(isNull(companies.lexwareId), inArray(sql`lower(${contacts.email})`, mails)))
    .limit(1);
  if (byContact?.companyId) return unlinked.find((c) => c.id === byContact.companyId) ?? null;
  const domains = new Set(mails.map(domainOf).filter(Boolean));
  return unlinked.find((c) => c.emailDomain && domains.has(c.emailDomain)) ?? null;
}

export type LexwareSyncResult = { created: number; updated: number; linked: number; contacts: number; archived: number; duplicates: number };

// Alle Kunden und Lieferanten aus Lexware abgleichen. Lexware ist das Maß der Dinge für die Stammdaten.
export async function syncLexwareContacts(): Promise<LexwareSyncResult> {
  if (!process.env.LEXWARE_API_KEY) throw new Error("LEXWARE_API_KEY fehlt");
  const result: LexwareSyncResult = { created: 0, updated: 0, linked: 0, contacts: 0, archived: 0, duplicates: 0 };
  const all = await fetchAllContacts();
  const dismissed = new Set(await readState<string[]>(DISMISSED_KEY, []));
  const dupes: Duplicate[] = [];

  for (const lx of all) {
    const [existing] = await db.select().from(companies).where(eq(companies.lexwareId, lx.id));
    if (existing) {
      result.contacts += await applyContact(lx, existing);
      result.updated++;
      if (lx.archived) result.archived++;
      continue;
    }
    // Archivierte, die das CRM noch nicht kennt, nicht neu anlegen
    if (lx.archived) continue;

    const unlinked = await db.select().from(companies).where(and(isNull(companies.lexwareId), sql`${companies.kind} <> 'wettbewerber'`));
    const match = await exactMatch(lx, unlinked);
    if (match) {
      result.contacts += await applyContact(lx, match);
      result.linked++;
      continue;
    }
    const lookalike = unlinked.find((c) => similar(c.name, nameOf(lx)) && !dismissed.has(`${lx.id}:${c.id}`));
    if (lookalike) {
      const number = lx.roles.customer?.number ?? lx.roles.vendor?.number;
      dupes.push({ lexwareId: lx.id, lexwareName: nameOf(lx), number: number ? String(number) : null, companyId: lookalike.id, companyName: lookalike.name });
      continue;
    }
    const company = await createCompanyFrom(lx);
    result.contacts += await applyContact(lx, company);
    result.created++;
  }

  // In Lexware gelöschte Kontakte wie archivierte behandeln
  const ids = all.map((c) => c.id);
  if (ids.length) {
    await db
      .update(companies)
      .set({ lexwareArchived: true })
      .where(and(sql`${companies.lexwareId} is not null`, notInArray(companies.lexwareId, ids)));
  }

  await writeState(DUPES_KEY, dupes);
  await writeState(SYNCED_KEY, todayIso());
  result.duplicates = dupes.length;
  return result;
}

// Täglicher Abgleich im regelmäßigen Job: einmal pro Tag ab 6 Uhr
export async function syncLexwareContactsIfDue() {
  const hour = Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", timeZone: "Europe/Berlin" }).format(new Date()));
  if (hour < 6 || (await readState<string | null>(SYNCED_KEY, null)) === todayIso()) return "heute schon erledigt";
  return syncLexwareContacts();
}

async function companyById(id: number) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) throw new Error("Firma nicht gefunden.");
  return company;
}

// Firma zu einem Lexware-Kontakt (z. B. für einen neuen Beleg); unbekannte holt sie aus Lexware
// und verknüpft eindeutige Treffer oder legt die Firma an
export async function companyForLexwareContact(lexwareId: string): Promise<Company | null> {
  const [existing] = await db.select().from(companies).where(eq(companies.lexwareId, lexwareId));
  if (existing) return existing;
  const lx = await lexware<LexwareContact>(`/contacts/${lexwareId}`);
  if (!lx.roles.customer && !lx.roles.vendor) return null;
  const unlinked = await db.select().from(companies).where(and(isNull(companies.lexwareId), sql`${companies.kind} <> 'wettbewerber'`));
  const company = (await exactMatch(lx, unlinked)) ?? (await createCompanyFrom(lx));
  await applyContact(lx, company);
  return companyById(company.id);
}

// Eine Firma sofort aus Lexware neu laden
export async function refreshCompanyFromLexware(companyId: number) {
  const company = await companyById(companyId);
  if (!company.lexwareId) throw new Error("Diese Firma ist nicht mit Lexware verknüpft.");
  await applyContact(await lexware<LexwareContact>(`/contacts/${company.lexwareId}`), company);
}

// CRM-Firma mit einem vorhandenen Lexware-Kontakt verknüpfen und dessen Stammdaten übernehmen
export async function linkCompanyToLexware(companyId: number, lexwareId: string) {
  const company = await companyById(companyId);
  const [taken] = await db.select({ name: companies.name }).from(companies).where(eq(companies.lexwareId, lexwareId));
  if (taken) throw new Error(`Dieser Lexware-Kontakt ist schon mit „${taken.name}“ verknüpft.`);
  await applyContact(await lexware<LexwareContact>(`/contacts/${lexwareId}`), company);
  await dropDuplicate((d) => d.lexwareId === lexwareId);
}

// Vorgeschlagene Dublette: „Sind verschieden“ legt die Lexware-Firma neu an und fragt nicht wieder
export async function dismissDuplicate(lexwareId: string, companyId: number) {
  const dismissed = await readState<string[]>(DISMISSED_KEY, []);
  await writeState(DISMISSED_KEY, [...new Set([...dismissed, `${lexwareId}:${companyId}`])]);
  const [existing] = await db.select({ id: companies.id }).from(companies).where(eq(companies.lexwareId, lexwareId));
  if (!existing) {
    const lx = await lexware<LexwareContact>(`/contacts/${lexwareId}`);
    await applyContact(lx, await createCompanyFrom(lx));
  }
  await dropDuplicate((d) => d.lexwareId === lexwareId);
}

async function dropDuplicate(match: (d: Duplicate) => boolean) {
  await writeState(DUPES_KEY, (await duplicates()).filter((d) => !match(d)));
}

export type LexwareHit = { id: string; name: string; number: string | null; city: string | null; archived: boolean };

// Suche in den Lexware-Kontakten (Lexware sucht ab 3 Zeichen im Namen)
export async function searchLexwareContacts(query: string): Promise<LexwareHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const data = await lexware<Page>(`/contacts?name=${encodeURIComponent(q)}&size=20`);
  const linked = new Set(
    (await db.select({ id: companies.lexwareId }).from(companies).where(sql`${companies.lexwareId} is not null`)).map((r) => r.id),
  );
  return data.content
    .filter((c) => !linked.has(c.id))
    .map((c) => ({
      id: c.id,
      name: nameOf(c),
      number: String(c.roles.customer?.number ?? c.roles.vendor?.number ?? "") || null,
      city: c.addresses?.billing?.[0]?.city ?? null,
      archived: c.archived,
    }));
}

// Firma aus dem CRM in Lexware anlegen (nur auf Klick) und gleich verknüpfen
export async function createInLexware(companyId: number, opts: { customer: boolean; vendor: boolean; person: boolean }) {
  const company = await companyById(companyId);
  if (company.lexwareId) throw new Error("Diese Firma ist schon mit Lexware verknüpft.");
  if (!opts.customer && !opts.vendor) throw new Error("Bitte Kunde und/oder Lieferant wählen.");
  const people = await db.select().from(contacts).where(eq(contacts.companyId, companyId));

  const body: Record<string, unknown> = {
    version: 0,
    roles: { ...(opts.customer && { customer: {} }), ...(opts.vendor && { vendor: {} }) },
  };
  if (opts.person) {
    const own = people.length === 1 ? people[0] : null;
    const parts = company.name.trim().split(/\s+/);
    body.person = {
      firstName: own?.firstName ?? (parts.length > 1 ? parts.slice(0, -1).join(" ") : undefined),
      lastName: own?.lastName ?? parts[parts.length - 1],
    };
  } else {
    body.company = {
      name: company.name,
      contactPersons: people.slice(0, 20).map((p, i) => ({
        firstName: p.firstName ?? undefined,
        lastName: p.lastName,
        emailAddress: p.email ?? undefined,
        phoneNumber: p.phone ?? p.mobile ?? undefined,
        primary: i === 0,
      })),
    };
  }
  if (company.street || company.zip || company.city) {
    body.addresses = { billing: [{ street: company.street ?? undefined, zip: company.zip ?? undefined, city: company.city ?? undefined, countryCode: "DE" }] };
  }
  const mail = company.email ?? (opts.person ? people[0]?.email : null);
  const phone = company.phone ?? (opts.person ? people[0]?.phone ?? people[0]?.mobile : null);
  if (mail) body.emailAddresses = { business: [mail] };
  if (phone) body.phoneNumbers = { business: [phone] };

  const created = await lexware<{ id: string }>("/contacts", { method: "POST", body: JSON.stringify(body) });
  await pause(600);
  await applyContact(await lexware<LexwareContact>(`/contacts/${created.id}`), company);
}
